  // ---- 50-watch ----
  // Step 3 (polyfill each window) + step 99 (follow iframes and popups:
  // SSRS reports, Advanced Find, settings-only windows...).
  //
  // Ownership: the loader copy that owns a tab's root window (state.ownerId)
  // hooks window.open / observes frames for windows of that tab only. Popups
  // (other tabs) get their own loader copy (propagation): hooks made from
  // a foreign realm would die with it. The owner still sweeps its popups to
  // install the stub as early as possible after each navigation.

  X.markOf = function (doc) {
    try {
      return doc[X.MARK_KEY] || null;
    } catch (e) {
      return null;
    }
  };

  X.sameTab = function (win) {
    try {
      return win.top === X.state.root.top;
    } catch (e) {
      return false;
    }
  };

  X.processWindow = function (win, reason, depth) {
    depth = depth || 0;
    if (depth > 12) {
      return;
    }
    var doc = X.docOf(win);
    if (!doc) {
      return;
    }
    var mark = X.markOf(doc);
    if (!mark) {
      mark = {
        firstSeen: new Date().toISOString(),
        firstReadyState: doc.readyState,
        action: 'none',
        watchers: {}
      };
      try {
        doc[X.MARK_KEY] = mark;
      } catch (e) {
        return;
      }
      X.patchDocument(win, doc, mark, reason);
    } else if (mark.action === 'stub' || mark.action === 'none') {
      // The document may have grown since (XSL islands parsed later).
      X.upgradeIfEager(win, mark);
    }
    if (mark.action === 'reload') {
      return; // the whole document (frames included) is being replaced
    }
    X.fixStylesheets(win, doc, mark);
    X.attachWatchers(win, doc, mark);
    var frames;
    try {
      frames = win.frames;
    } catch (e) {
      return;
    }
    for (var i = 0; i < frames.length; i++) {
      X.processWindow(frames[i], 'frame', depth + 1);
    }
  };

  X.patchDocument = function (win, doc, mark, reason) {
    var info = X.detect(win);
    if (!info) {
      return;
    }
    mark.info = info;
    // A stub set on the initial about:blank Window survives the first
    // same-origin navigation (the Window is reused): such a document was
    // covered from its first script on.
    var inherited = false;
    try {
      inherited = !!(win.XSLTProcessor && win.XSLTProcessor.__bnzStub);
    } catch (e) { /* ignore */ }
    // Scripts of this document already ran (or are past parsing) without us.
    mark.missed = doc.readyState !== 'loading' && !inherited && !info.polyfilled;
    if (info.polyfilled) {
      mark.action = 'already';
      return;
    }
    if (!info.needsPolyfill) {
      mark.action = 'native';
      return;
    }
    // Stub first, always: it answers synchronous callers right now, even
    // when the eager install below is still downloading.
    mark.action = X.installStub(win, info) ? 'stub' : 'none';
    if (info.eager) {
      mark.action = 'eager';
      X.record('eager', win, reason + ' ' + JSON.stringify(info.signals));
      X.installPolyfillAsync(win, info);
    }
    if (mark.missed && win !== X.state.root) {
      X.reloadIfMissed(win, mark);
    }
  };

  // A window first patched with the lazy stub becomes "eager" when XSL
  // content appears (e.g. after full parse).
  X.upgradeIfEager = function (win, mark) {
    if (mark.action === 'eager' || mark.action === 'already' || mark.action === 'native' || mark.action === 'reload') {
      return;
    }
    // The sweeper calls this often: rescan only on readyState change or every 2 s.
    var now = new Date().getTime();
    var rs;
    try {
      rs = win.document.readyState;
    } catch (e) {
      return;
    }
    if (mark.lastScanState === rs && now - (mark.lastScanAt || 0) < 2000) {
      return;
    }
    mark.lastScanState = rs;
    mark.lastScanAt = now;
    var info = X.detect(win);
    if (info && info.needsPolyfill && info.eager && !info.polyfilled) {
      mark.action = 'eager';
      mark.info = info;
      X.record('eager-upgrade', win, JSON.stringify(info.signals));
      X.installPolyfillAsync(win, info);
    }
  };

  // Pages such as Advanced Find break during load when XSLT is missing.
  // Recover them once while this (living) copy watches:
  //  - top-level popup: reopen it (fresh initial about:blank Window, stubbed
  //    before navigation, so the page sees the stub from its first script);
  //  - otherwise: reload (best effort: the sweeper races the page scripts).
  X.reloadIfMissed = function (win, mark) {
    var url = X.safeUrl(win);
    if (!X.matchesAny(url, X.state.config.reloadIfMissedPatterns)) {
      return false;
    }
    try {
      if (win.__bnzRecovered) {
        X.record('recover-skipped', win, 'window already recovered once');
        return false;
      }
    } catch (e) { /* ignore */ }
    if (win === win.top && X.reopenPopup(win, mark)) {
      return true;
    }
    var store = null;
    var done = [];
    try {
      store = win.sessionStorage;
      done = JSON.parse(store.getItem(X.RELOAD_KEY) || '[]') || [];
    } catch (e) {
      done = [];
    }
    for (var i = 0; i < done.length; i++) {
      if (done[i] === url) {
        X.record('reload-skipped', win, 'already reloaded once');
        return false;
      }
    }
    if (!store) {
      return false; // no guard available: never risk a reload loop
    }
    try {
      done.push(url);
      store.setItem(X.RELOAD_KEY, JSON.stringify(done.slice(-20)));
    } catch (e) {
      return false;
    }
    mark.action = 'reload';
    X.record('reload', win, 'loaded before the patch');
    X.burst();
    try {
      win.location.reload();
      return true;
    } catch (e) {
      X.warn('reload failed', url, e);
      return false;
    }
  };

  // Closes `win` and opens the same URL again from its opener, with the same
  // name and geometry. The new window is watched from its about:blank state.
  X.reopenPopup = function (win, mark) {
    var url = X.safeUrl(win);
    var opener = null;
    try {
      opener = win.opener && X.docOf(win.opener) ? win.opener : null;
    } catch (e) { /* ignore */ }
    var from = opener || X.state.root;
    var name = '';
    var features = '';
    try {
      name = win.name || '';
      features = 'width=' + win.outerWidth + ',height=' + win.outerHeight +
        ',left=' + win.screenX + ',top=' + win.screenY + ',resizable=yes,scrollbars=yes';
    } catch (e) { /* ignore */ }
    try {
      mark.action = 'reload';
      var open = from.open.__bnzOriginal || from.open;
      win.close();
      var fresh = open.call(from, url, name, features);
      if (!fresh) {
        X.record('reopen-blocked', win, url);
        return false;
      }
      fresh.__bnzRecovered = true;
      X.record('reopen', null, url);
      X.watchPopup(fresh, url);
      return true;
    } catch (e) {
      X.warn('reopen failed', url, e);
      return false;
    }
  };

  // Per loader copy, per document: hooks and observers.
  X.attachWatchers = function (win, doc, mark) {
    var cfg = X.state.config;
    if (!X.state.active || !mark.watchers || mark.watchers[X.copyId] || mark.action === 'reload') {
      return;
    }
    mark.watchers[X.copyId] = true;
    if (X.sameTab(win)) {
      if (cfg.watchPopups) {
        X.hookWindowOpen(win);
      }
      if (cfg.watchFrames) {
        X.hookInsertion(win);
        X.observeFrames(win, doc);
      }
    } else if (cfg.propagateToPopups && win === win.top) {
      X.propagateTo(win);
    }
  };

  // Evaluates a loader copy inside a popup and bootstraps it there.
  X.propagateTo = function (win) {
    var api = X.ensureLoaderIn(win);
    if (!api) {
      return;
    }
    try {
      api.bootstrap();
    } catch (e) {
      X.warn('popup bootstrap failed', X.safeUrl(win), e);
    }
  };

  // window.open hook: Dynamics opens reports (viewer.aspx), Advanced Find
  // (main.aspx?pagetype=advancedfind) and "Advanced Settings" with it.
  X.hookWindowOpen = function (win) {
    try {
      var current = win.open;
      if (typeof current !== 'function' || current.__bnzHooked) {
        return;
      }
      var original = current;
      var hooked = function () {
        var popup = original.apply(this, arguments);
        try {
          if (popup) {
            X.watchPopup(popup, arguments[0]);
          }
        } catch (e) {
          X.warn('popup watch failed', e);
        }
        return popup;
      };
      hooked.__bnzHooked = true;
      hooked.__bnzOriginal = original;
      win.open = hooked;
    } catch (e) { /* ignore */ }
  };

  X.watchPopup = function (popup, requestedUrl) {
    var state = X.state;
    if (!state.active) {
      return;
    }
    for (var i = 0; i < state.popups.length; i++) {
      if (state.popups[i].win === popup) {
        X.burst();
        return;
      }
    }
    if (state.popups.length >= state.config.maxTrackedPopups) {
      state.popups.shift();
    }
    state.popups.push({ win: popup, started: new Date().getTime(), requestedUrl: String(requestedUrl || '') });
    X.record('popup-watched', null, String(requestedUrl || ''));
    X.burst();
    // Right now, while the popup is still on its initial about:blank: the
    // stub and loader copy set on this Window survive the navigation.
    X.sweepPopup(state.popups[state.popups.length - 1]);
  };

  X.sweepPopup = function (entry) {
    X.processWindow(entry.win, 'popup');
  };

  // Script-inserted iframes: stub their initial about:blank Window
  // synchronously, before their navigation commits (Window reuse carries
  // the stub into the loaded page). Hooked once per realm.
  X.hookInsertion = function (win) {
    try {
      var proto = win.Node && win.Node.prototype;
      if (!proto || !proto.appendChild || proto.appendChild.__bnzHooked) {
        return;
      }
      var wrap = function (name) {
        var original = proto[name];
        if (typeof original !== 'function') {
          return;
        }
        var hooked = function (node) {
          var result = original.apply(this, arguments);
          try {
            X.onInserted(node);
          } catch (e) { /* never break the page */ }
          return result;
        };
        hooked.__bnzHooked = true;
        hooked.__bnzOriginal = original;
        proto[name] = hooked;
      };
      wrap('appendChild');
      wrap('insertBefore');
    } catch (e) { /* ignore */ }
  };

  X.onInserted = function (node) {
    if (!node || node.nodeType !== 1) {
      return;
    }
    var tag = String(node.nodeName).toLowerCase();
    if (tag === 'iframe' || tag === 'frame') {
      X.attachFrame(node);
      return;
    }
    if (node.firstElementChild && node.getElementsByTagName) {
      var list = node.getElementsByTagName('iframe');
      for (var i = 0; i < list.length; i++) {
        X.attachFrame(list[i]);
      }
    }
  };

  // ---- sweeper ----
  X.burst = function () {
    var state = X.state;
    state.burstUntil = new Date().getTime() + state.config.burstMs;
    if (state.sweepDelay !== state.config.sweepFastMs) {
      X.scheduleSweep(0);
    }
  };

  X.scheduleSweep = function (delay) {
    var state = X.state;
    if (state.sweepTimer) {
      loaderWindow.clearTimeout(state.sweepTimer);
    }
    state.sweepTimer = loaderWindow.setTimeout(X.sweep, delay);
  };

  X.sweep = function () {
    var state = X.state;
    state.sweepTimer = null;
    var now = new Date().getTime();
    try {
      X.processWindow(state.root, 'sweep');
      for (var i = state.popups.length - 1; i >= 0; i--) {
        var entry = state.popups[i];
        var closed;
        try {
          closed = entry.win.closed;
        } catch (e) {
          closed = true;
        }
        if (closed || now - entry.started > state.config.popupMaxWatchMs) {
          state.popups.splice(i, 1);
          continue;
        }
        X.sweepPopup(entry);
      }
    } catch (e) {
      X.warn('sweep failed', e);
    }
    state.sweepDelay = now < state.burstUntil ? state.config.sweepFastMs : state.config.sweepSlowMs;
    X.scheduleSweep(state.sweepDelay);
  };

  // iframes added later (dialogs, report viewer, form tabs) and every
  // navigation of an iframe (its load event; the sweeper sees it earlier).
  X.attachFrame = function (frameEl) {
    try {
      if (frameEl.__bnzXsltPatchFrame === X.copyId) {
        return;
      }
      frameEl.__bnzXsltPatchFrame = X.copyId;
      frameEl.addEventListener('load', function () {
        X.processWindow(frameEl.contentWindow, 'frame-load');
      });
      X.burst();
      if (frameEl.contentWindow) {
        X.processWindow(frameEl.contentWindow, 'frame-attach');
      }
    } catch (e) { /* ignore */ }
  };

  X.observeFrames = function (win, doc) {
    var existing;
    try {
      existing = doc.querySelectorAll('iframe, frame');
    } catch (e) {
      existing = [];
    }
    for (var i = 0; i < existing.length; i++) {
      X.attachFrame(existing[i]);
    }
    var MO = win.MutationObserver || loaderWindow.MutationObserver;
    // documentElement may not exist yet while loading: the next sweep of a
    // new mark retries through attachWatchers only once, so observe the
    // document node itself (always present).
    if (!MO) {
      return false;
    }
    try {
      var observer = new MO(function (mutations) {
        for (var m = 0; m < mutations.length; m++) {
          var added = mutations[m].addedNodes;
          for (var n = 0; n < added.length; n++) {
            var node = added[n];
            if (node.nodeType !== 1) {
              continue;
            }
            var tag = String(node.nodeName).toLowerCase();
            if (tag === 'iframe' || tag === 'frame') {
              X.attachFrame(node);
            } else if (node.querySelectorAll) {
              var inner = node.querySelectorAll('iframe, frame');
              for (var k = 0; k < inner.length; k++) {
                X.attachFrame(inner[k]);
              }
            }
          }
        }
      });
      observer.observe(doc, { childList: true, subtree: true });
      return true;
    } catch (e) {
      X.warn('MutationObserver failed', e);
      return false;
    }
  };
