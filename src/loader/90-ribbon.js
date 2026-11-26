  // ---- 90-ribbon ----

  // Highest same-origin ancestor of `win`: legacy web client runs ribbon code
  // in main.aspx (top) while forms live in contentIFrameN; UCI runs it in top.
  X.rootOf = function (win) {
    var current = win;
    try {
      while (current.parent && current.parent !== current && X.docOf(current.parent)) {
        current = current.parent;
      }
    } catch (e) { /* cross-origin parent */ }
    return current;
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
      } catch (ignored) { /* ignore */ }
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
      if (state.version !== X.buildInfo.version) {
        X.warn('two loader versions in the same tab:', state.version, X.buildInfo.version);
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
    X.addJournalEntry('bootstrap', root, 'mode=' + state.config.mode + ' copy=' + X.copyId +
      (state.seededFrom ? ' seededFrom=' + state.seededFrom : ''));

    state.active = state.config.mode !== 'off' && X.needsPolyfill(root);
    if (!state.active) {
      X.addJournalEntry('inactive', root, state.config.mode === 'off' ? 'mode=off' : 'native XSLT works');
      return state;
    }
    if (state.config.prefetch) {
      X.prefetch();
    }
    // Opener first: if it reloads this window, patching it now is wasted
    // (and could reload frames for nothing).
    if (state.config.adoptOpener && X.handOverToOpener(root)) {
      X.addJournalEntry('reloaded-by-opener', root);
      return state;
    }
    X.processWindow(root, 'bootstrap');
    if (loaderWindow !== root) {
      X.processWindow(loaderWindow, 'bootstrap-self');
    }
    X.startFastSweep();
    return state;
  };

  X.newState = function (root, seed) {
    seed = seed || {};
    var state = {
      version: X.buildInfo.version,
      ownerId: X.copyId,
      api: publicApi,
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
  X.handOverToOpener = function (root) {
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
      X.addJournalEntry('opener-adopted', openerRoot, reloading ? 'reloading this window' : '');
      return reloading;
    } catch (e) {
      X.warn('opener adoption failed', e);
      return false;
    }
  };

  // Called by a popup's loader copy on its opener's copy. `missed`: the popup
  // bootstrapped after its document had loaded (scripts ran without XSLT).
  X.adoptPopup = function (popup, missed) {
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
    return X.recoverIfMissed(popup, mark);
  };

  // Legacy web client shows disabled buttons greyed out: hide ours.
  X.hideLegacyButton = function (state) {
    if (!state.config.hideLegacyButton || state.config.showButton) {
      return;
    }
    var doc = X.docOf(loaderWindow);
    if (!doc || !doc.querySelectorAll) {
      return;
    }
    try {
      var nodes = doc.querySelectorAll('[id*="' + X.buildInfo.buttonIdFragment + '"]');
      for (var i = 0; i < nodes.length; i++) {
        var button = nodes[i];
        var container = button.closest ? (button.closest('li') || button) : button;
        container.style.display = 'none';
      }
    } catch (e) { /* ignore */ }
  };

  X.diagnostics = function () {
    var state = X.state;
    if (!state) {
      return { bootstrapped: false, version: X.buildInfo.version, copyId: X.copyId };
    }
    var windows = [];
    var xsltErrors = [];
    var includesFailed = [];
    var includesTruncated = [];
    var collectWindow = function (win, depth) {
      var doc = X.docOf(win);
      if (!doc || depth > 12) {
        return;
      }
      var mark = X.markOf(doc);
      var polyfillInfo = null;
      try {
        polyfillInfo = win.__bnzXsltPolyfillLoaded || null;
      } catch (e) { /* ignore */ }
      var url = X.safeUrl(win);
      var j;
      if (polyfillInfo && polyfillInfo.errors) {
        for (j = 0; j < polyfillInfo.errors.length; j++) {
          var error = polyfillInfo.errors[j];
          xsltErrors.push({ url: url, at: error.at, method: error.method,
            stylesheet: error.stylesheet, error: error.error });
        }
      }
      if (polyfillInfo && polyfillInfo.includes && polyfillInfo.includes.failed) {
        for (j = 0; j < polyfillInfo.includes.failed.length; j++) {
          includesFailed.push(polyfillInfo.includes.failed[j]);
        }
      }
      // References dropped beyond the nesting or copy limits (DYN-006).
      if (polyfillInfo && polyfillInfo.includes && polyfillInfo.includes.truncated) {
        for (j = 0; j < polyfillInfo.includes.truncated.length; j++) {
          includesTruncated.push(polyfillInfo.includes.truncated[j]);
        }
      }
      windows.push({
        url: url,
        action: mark ? mark.action : 'unprocessed',
        missed: mark ? !!mark.missed : false,
        cssFallbacks: mark && mark.cssFallbacks || 0,
        // Report field kept for compatibility: true for native XSLT, our
        // polyfill or a third-party shim (see X.isXsltUsable).
        nativeUsable: X.isXsltUsable(win),
        polyfilled: X.isPolyfilled(win),
        loaderCopy: !!X.loaderApiOf(win),
        xsltCalls: polyfillInfo && polyfillInfo.calls || 0,
        xsltErrors: polyfillInfo && polyfillInfo.errors ? polyfillInfo.errors.length : 0,
        includesInlined: polyfillInfo && polyfillInfo.includes ? polyfillInfo.includes.inlined.length : 0
      });
      for (var i = 0; i < win.frames.length; i++) {
        collectWindow(win.frames[i], depth + 1);
      }
    };
    collectWindow(state.root, 0);
    for (var i = 0; i < state.popups.length; i++) {
      collectWindow(state.popups[i].win, 0);
    }
    return {
      bootstrapped: true,
      active: state.active,
      version: state.version,
      polyfillVersion: X.buildInfo.polyfillVersion,
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
      includesTruncated: includesTruncated,
      journal: state.journal.slice(-40)
    };
  };

  X.showDialog = function (text) {
    var win = loaderWindow;
    try {
      if (win.Xrm && win.Xrm.Navigation && win.Xrm.Navigation.openAlertDialog) {
        win.Xrm.Navigation.openAlertDialog({ title: 'XSLT Patch', text: text });
        return;
      }
      if (win.Xrm && win.Xrm.Utility && win.Xrm.Utility.alertDialog) {
        win.Xrm.Utility.alertDialog(text);
        return;
      }
    } catch (e) { /* fall back */ }
    win.alert(text);
  };

  // ---- public API ----
  publicApi.version = X.buildInfo.version;
  publicApi.isLoader = true;

  publicApi.Ribbon = {
    // EnableRule > CustomRule FunctionName="bnz.XsltPatch.Ribbon.enable".
    // Never throws. Returns false (button hidden in UCI) unless diagnostics
    // are switched on.
    enable: function () {
      try {
        var state = X.bootstrap();
        X.hideLegacyButton(state);
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
        var diagnostics = X.diagnostics();
        if (loaderWindow.console) {
          loaderWindow.console.log(X.LOG_PREFIX, 'diagnostics', diagnostics);
        }
        var lines = [
          'Version : ' + diagnostics.version + ' (polyfill ' + diagnostics.polyfillVersion + ')',
          'Mode : ' + diagnostics.config.mode + (diagnostics.active ? '' : ' (inactif : XSLT natif OK)'),
          'Polyfill téléchargé : ' + (diagnostics.polyfillDownloaded ? 'oui' : 'non'),
          'Popups suivies : ' + diagnostics.trackedPopups,
          'Fenêtres :'
        ];
        for (var i = 0; i < diagnostics.windows.length; i++) {
          var entry = diagnostics.windows[i];
          lines.push(' - [' + entry.action + (entry.polyfilled ? ', polyfill' : '') +
            (entry.nativeUsable ? ', ok' : ', KO') +
            (entry.xsltCalls ? ', ' + entry.xsltCalls + ' appels' : '') +
            (entry.xsltErrors ? ', ' + entry.xsltErrors + ' erreurs' : '') +
            (entry.cssFallbacks ? ', ' + entry.cssFallbacks + ' CSS de repli' : '') + '] ' + entry.url);
        }
        if (diagnostics.xsltErrors.length) {
          var lastError = diagnostics.xsltErrors[diagnostics.xsltErrors.length - 1];
          lines.push('Dernière erreur XSLT : ' + lastError.method + ' - ' + lastError.error + ' (' + lastError.stylesheet + ')');
        }
        lines.push('Rapport complet : copy(bnz.XsltPatch.report()) dans la console (F12).');
        X.showDialog(lines.join('\n'));
      } catch (e) {
        X.warn('diagnostics failed', e);
      }
    }
  };

  // For other loader copies, tests and console use.
  publicApi.bootstrap = function () {
    return X.bootstrap();
  };
  publicApi.diagnostics = function () {
    return X.diagnostics();
  };
  // JSON text to paste in a ticket: copy(bnz.XsltPatch.report()) in DevTools.
  publicApi.report = function () {
    try {
      if (!X.state) {
        X.bootstrap();
      }
      var diagnostics = X.diagnostics();
      diagnostics.userAgent = loaderWindow.navigator ? loaderWindow.navigator.userAgent : '';
      return JSON.stringify(diagnostics, null, 2);
    } catch (e) {
      return JSON.stringify({ error: String(e && e.message || e) });
    }
  };
  publicApi.processWindow = function (win) {
    if (!X.state) {
      X.bootstrap();
    }
    if (X.state && X.state.active) {
      X.processWindow(win, 'manual');
    }
    return X.state;
  };
  publicApi.adopt = function (popup, missed) {
    if (!X.state) {
      X.bootstrap();
    }
    return X.adoptPopup(popup, missed);
  };
  publicApi.setDebug = function (enabled) {
    try {
      loaderWindow.localStorage.setItem(X.STORAGE_DEBUG_KEY, enabled ? '1' : '0');
    } catch (e) { /* ignore */ }
    if (X.state) {
      X.state.config.debug = !!enabled;
      X.state.config.showButton = !!enabled;
    }
  };
