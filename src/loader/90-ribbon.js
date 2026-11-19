  // ---- 90-ribbon ----

  // Highest same-origin ancestor of `win`: legacy web client runs ribbon code
  // in main.aspx (top) while forms live in contentIFrameN; UCI runs it in top.
  X.rootOf = function (win) {
    var w = win;
    try {
      while (w.parent && w.parent !== w && X.docOf(w.parent)) {
        w = w.parent;
      }
    } catch (e) { /* cross-origin parent */ }
    return w;
  };

  X.readSeed = function (win) {
    var seed = null;
    try {
      seed = win[X.SEED_KEY] || null;
      if (seed) {
        delete win[X.SEED_KEY];
      }
    } catch (e) {
      try {
        win[X.SEED_KEY] = undefined;
      } catch (e2) { /* ignore */ }
    }
    return seed;
  };

  // Bootstrap. State lives on the tab's root window and is owned by the loader
  // copy of the root's realm: a copy evaluated in a frame realm first injects
  // a copy into the root realm and delegates to it, so hooks never outlive
  // their realm.
  X.bootstrap = function () {
    var root = X.rootOf(loaderWindow);
    if (root !== loaderWindow && !root[X.STATE_KEY]) {
      // Need X.state for downloads: borrow a temporary one.
      X.state = X.newState(root, X.readSeed(loaderWindow));
      var rootApi = X.ensureLoaderIn(root);
      X.state = null;
      if (rootApi) {
        rootApi.bootstrap();
        return rootApi.processWindow(loaderWindow) || root[X.STATE_KEY];
      }
    } else if (root !== loaderWindow) {
      var api = X.loaderApiOf(root);
      if (api && root[X.STATE_KEY].ownerId !== X.copyId) {
        X.state = root[X.STATE_KEY];
        api.processWindow(loaderWindow);
        return X.state;
      }
    }

    var state = root[X.STATE_KEY];
    if (state) {
      X.state = state;
      if (state.version !== X.build.version) {
        X.warn('two loader versions in the same tab:', state.version, X.build.version);
      }
      if (state.active) {
        X.processWindow(root, 'enable');
        if (loaderWindow !== root) {
          X.processWindow(loaderWindow, 'enable-self');
        }
      }
      return state;
    }

    state = X.newState(root, X.readSeed(root));
    root[X.STATE_KEY] = state;
    X.state = state;
    X.record('bootstrap', root, 'mode=' + state.config.mode + ' copy=' + X.copyId +
      (state.seededFrom ? ' seededFrom=' + state.seededFrom : ''));

    state.active = state.config.mode !== 'off' && X.needsPolyfill(root);
    if (!state.active) {
      X.record('inactive', root, state.config.mode === 'off' ? 'mode=off' : 'native XSLT works');
      return state;
    }
    if (state.config.prefetch) {
      X.prefetch();
    }
    // Opener first: if it reloads this window, patching it now is wasted
    // (and could reload frames for nothing).
    if (state.config.adoptOpener && X.adoptOpener(root)) {
      X.record('reloaded-by-opener', root);
      return state;
    }
    X.processWindow(root, 'bootstrap');
    if (loaderWindow !== root) {
      X.processWindow(loaderWindow, 'bootstrap-self');
    }
    X.burst();
    return state;
  };

  X.newState = function (root, seed) {
    seed = seed || {};
    var state = {
      version: X.build.version,
      ownerId: X.copyId,
      api: ns,
      startedAt: new Date().toISOString(),
      config: X.readConfig(root),
      active: false,
      clientUrl: seed.clientUrl || null,
      polyfillSource: seed.polyfillSource || null,
      loaderSource: seed.loaderSource || null,
      seededFrom: seed.from || null,
      pending: {},
      popups: [],
      journal: [],
      sweepTimer: null,
      sweepDelay: null,
      burstUntil: 0,
      root: root
    };
    X.state = state;
    if (!state.clientUrl) {
      state.clientUrl = X.getClientUrl();
    }
    return state;
  };

  // A popup bootstrapped by itself (its own ribbon, late) hands itself to its
  // opener's loader (injected there if needed). The opener survives the
  // popup's reload, so it can reload the popup under watch.
  // Returns true when the opener reloads this window.
  X.adoptOpener = function (root) {
    var opener;
    try {
      opener = root.opener;
    } catch (e) {
      return false;
    }
    if (!opener || opener === root || !X.docOf(opener)) {
      return false;
    }
    var openerRoot = X.rootOf(opener);
    var api = X.ensureLoaderIn(openerRoot);
    if (!api) {
      return false;
    }
    try {
      api.bootstrap();
      var reloading = api.adopt(root, X.docOf(root).readyState !== 'loading') === true;
      X.record('opener-adopted', openerRoot, reloading ? 'reloading this window' : '');
      return reloading;
    } catch (e) {
      X.warn('opener adoption failed', e);
      return false;
    }
  };

  // Called by a popup's loader copy on its opener's copy. `missed`: the popup
  // bootstrapped after its document had loaded (scripts ran without XSLT).
  X.adopt = function (popup, missed) {
    var state = X.state;
    if (!state || !state.active) {
      return false;
    }
    // Watching sweeps the popup at once: a missed Advanced Find may already be
    // reloading after this call.
    X.watchPopup(popup, '');
    var doc = X.docOf(popup);
    var mark = doc && X.markOf(doc);
    if (mark && mark.action === 'reload') {
      return true;
    }
    if (!doc || !missed || !X.needsPolyfill(popup)) {
      return false;
    }
    if (!mark) {
      mark = { firstSeen: new Date().toISOString(), action: 'none', missed: true, watchers: {} };
      doc[X.MARK_KEY] = mark;
    }
    return X.reloadIfMissed(popup, mark);
  };

  // Legacy web client shows disabled buttons greyed out: hide ours.
  X.hideLegacyButtons = function (state) {
    if (!state.config.hideLegacyButton || state.config.showButton) {
      return;
    }
    var doc = X.docOf(loaderWindow);
    if (!doc || !doc.querySelectorAll) {
      return;
    }
    try {
      var nodes = doc.querySelectorAll('[id*="' + X.build.buttonIdFragment + '"]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var li = el.closest ? (el.closest('li') || el) : el;
        li.style.display = 'none';
      }
    } catch (e) { /* ignore */ }
  };

  X.diagnostics = function () {
    var state = X.state;
    if (!state) {
      return { bootstrapped: false, version: X.build.version, copyId: X.copyId };
    }
    var windows = [];
    var xsltErrors = [];
    var includesFailed = [];
    var walk = function (win, depth) {
      var doc = X.docOf(win);
      if (!doc || depth > 12) {
        return;
      }
      var mark = X.markOf(doc);
      var poly = null;
      try {
        poly = win.__bnzXsltPolyfillLoaded || null;
      } catch (e) { /* ignore */ }
      var url = X.safeUrl(win);
      var j;
      if (poly && poly.errors) {
        for (j = 0; j < poly.errors.length; j++) {
          xsltErrors.push({ url: url, at: poly.errors[j].at, method: poly.errors[j].method,
            stylesheet: poly.errors[j].stylesheet, error: poly.errors[j].error });
        }
      }
      if (poly && poly.includes && poly.includes.failed) {
        for (j = 0; j < poly.includes.failed.length; j++) {
          includesFailed.push(poly.includes.failed[j]);
        }
      }
      windows.push({
        url: url,
        action: mark ? mark.action : 'unprocessed',
        missed: mark ? !!mark.missed : false,
        cssFallbacks: mark && mark.cssFallbacks || 0,
        nativeUsable: X.isXsltUsable(win),
        polyfilled: X.isPolyfilled(win),
        loaderCopy: !!X.loaderApiOf(win),
        xsltCalls: poly && poly.calls || 0,
        xsltErrors: poly && poly.errors ? poly.errors.length : 0,
        includesInlined: poly && poly.includes ? poly.includes.inlined.length : 0
      });
      for (var i = 0; i < win.frames.length; i++) {
        walk(win.frames[i], depth + 1);
      }
    };
    walk(state.root, 0);
    for (var p = 0; p < state.popups.length; p++) {
      walk(state.popups[p].win, 0);
    }
    return {
      bootstrapped: true,
      active: state.active,
      version: state.version,
      polyfillVersion: X.build.polyfillVersion,
      copyId: X.copyId,
      ownerId: state.ownerId,
      startedAt: state.startedAt,
      seededFrom: state.seededFrom,
      config: state.config,
      clientUrl: state.clientUrl,
      polyfillUrl: X.polyfillUrl(),
      polyfillDownloaded: !!state.polyfillSource,
      trackedPopups: state.popups.length,
      windows: windows,
      xsltErrors: xsltErrors,
      includesFailed: includesFailed,
      journal: state.journal.slice(-40)
    };
  };

  X.showDialog = function (text) {
    var w = loaderWindow;
    try {
      if (w.Xrm && w.Xrm.Navigation && w.Xrm.Navigation.openAlertDialog) {
        w.Xrm.Navigation.openAlertDialog({ title: 'XSLT Patch', text: text });
        return;
      }
      if (w.Xrm && w.Xrm.Utility && w.Xrm.Utility.alertDialog) {
        w.Xrm.Utility.alertDialog(text);
        return;
      }
    } catch (e) { /* fall back */ }
    w.alert(text);
  };

  // ---- public API ----
  ns.version = X.build.version;
  ns.isLoader = true;

  ns.Ribbon = {
    // EnableRule > CustomRule FunctionName="bnz.XsltPatch.Ribbon.enable".
    // Never throws. Returns false (button hidden in UCI) unless diagnostics
    // are switched on.
    enable: function () {
      try {
        var state = X.bootstrap();
        X.hideLegacyButtons(state);
        return !!state.config.showButton;
      } catch (e) {
        X.warn('enable rule failed', e);
        return false;
      }
    },
    // Command action of the diagnostics button.
    showDiagnostics: function () {
      try {
        X.bootstrap();
        var d = X.diagnostics();
        if (loaderWindow.console) {
          loaderWindow.console.log(X.PREFIX, 'diagnostics', d);
        }
        var lines = [
          'Version : ' + d.version + ' (polyfill ' + d.polyfillVersion + ')',
          'Mode : ' + d.config.mode + (d.active ? '' : ' (inactif : XSLT natif OK)'),
          'Polyfill téléchargé : ' + (d.polyfillDownloaded ? 'oui' : 'non'),
          'Popups suivies : ' + d.trackedPopups,
          'Fenêtres :'
        ];
        for (var i = 0; i < d.windows.length; i++) {
          var w = d.windows[i];
          lines.push(' - [' + w.action + (w.polyfilled ? ', polyfill' : '') +
            (w.nativeUsable ? ', ok' : ', KO') +
            (w.xsltCalls ? ', ' + w.xsltCalls + ' appels' : '') +
            (w.xsltErrors ? ', ' + w.xsltErrors + ' erreurs' : '') +
            (w.cssFallbacks ? ', ' + w.cssFallbacks + ' CSS de repli' : '') + '] ' + w.url);
        }
        if (d.xsltErrors.length) {
          var last = d.xsltErrors[d.xsltErrors.length - 1];
          lines.push('Dernière erreur XSLT : ' + last.method + ' - ' + last.error + ' (' + last.stylesheet + ')');
        }
        lines.push('Rapport complet : copy(bnz.XsltPatch.report()) dans la console (F12).');
        X.showDialog(lines.join('\n'));
      } catch (e) {
        X.warn('diagnostics failed', e);
      }
    }
  };

  // For other loader copies, tests and console use.
  ns.bootstrap = function () {
    return X.bootstrap();
  };
  ns.diagnostics = function () {
    return X.diagnostics();
  };
  // JSON text to paste in a ticket: copy(bnz.XsltPatch.report()) in DevTools.
  ns.report = function () {
    try {
      if (!X.state) {
        X.bootstrap();
      }
      var d = X.diagnostics();
      d.userAgent = loaderWindow.navigator ? loaderWindow.navigator.userAgent : '';
      return JSON.stringify(d, null, 2);
    } catch (e) {
      return JSON.stringify({ error: String(e && e.message || e) });
    }
  };
  ns.processWindow = function (win) {
    if (!X.state) {
      X.bootstrap();
    }
    if (X.state && X.state.active) {
      X.processWindow(win, 'manual');
    }
    return X.state;
  };
  ns.adopt = function (popup, missed) {
    if (!X.state) {
      X.bootstrap();
    }
    return X.adopt(popup, missed);
  };
  ns.setDebug = function (on) {
    try {
      loaderWindow.localStorage.setItem(X.STORAGE_DEBUG_KEY, on ? '1' : '0');
    } catch (e) { /* ignore */ }
    if (X.state) {
      X.state.config.debug = !!on;
      X.state.config.showButton = !!on;
    }
  };
