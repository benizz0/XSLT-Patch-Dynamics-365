  // ---- 40-polyfill ----
  // Step 2 of the patch: fetch the forked polyfill web resource and run it
  // inside a target window (its own JS realm). Also fetches the loader itself
  // to propagate it into popups / opener / root realms.

  X.getClientUrl = function () {
    var win = loaderWindow;
    try {
      if (win.Xrm && win.Xrm.Utility && typeof win.Xrm.Utility.getGlobalContext === 'function') {
        return win.Xrm.Utility.getGlobalContext().getClientUrl();
      }
    } catch (e) { /* 9.x API missing */ }
    try {
      if (win.Xrm && win.Xrm.Page && win.Xrm.Page.context) {
        return win.Xrm.Page.context.getClientUrl();
      }
    } catch (e) { /* 8.x API missing */ }
    try {
      if (typeof win.GetGlobalContext === 'function') {
        return win.GetGlobalContext().getClientUrl();
      }
    } catch (e) { /* not in a web resource */ }
    // Last resort: everything before "/WebResources/", "/main.aspx" or "/_..."
    var href = X.safeUrl(win);
    var urlMatch = /^(https?:\/\/[^\/]+(?:\/[^\/_][^\/]*)?)\/(?:WebResources|main\.aspx|_|uclient|form|crmreports|advancedfind|tools)/i.exec(href);
    if (urlMatch) {
      return urlMatch[1];
    }
    return win.location.protocol + '//' + win.location.host;
  };

  X.webResourceUrl = function (name) {
    var base = X.state.clientUrl.replace(/\/+$/, '');
    return base + '/WebResources/' + name + '?ver=' + encodeURIComponent(X.buildInfo.webResourceVer);
  };

  X.polyfillUrl = function () {
    return X.webResourceUrl(X.buildInfo.polyfillWebResource);
  };

  X.loaderUrl = function () {
    return X.webResourceUrl(X.buildInfo.loaderWebResource);
  };

  // kind: 'polyfill' | 'loader'. The downloaded text is cached on the shared
  // state under `cacheKey`.
  X.downloads = {
    polyfill: { cacheKey: 'polyfillSource', url: function () { return X.polyfillUrl(); } },
    loader: { cacheKey: 'loaderSource', url: function () { return X.loaderUrl(); } }
  };

  // Synchronous fetch: the lazy stub must answer `new XSLTProcessor()` now.
  // DYN-004: XHR decodes JS as UTF-8, which the single-file wasm needs.
  X.downloadSync = function (kind) {
    var state = X.state;
    var download = X.downloads[kind];
    if (state[download.cacheKey]) {
      return state[download.cacheKey];
    }
    var xhr = new loaderWindow.XMLHttpRequest();
    xhr.open('GET', download.url(), false);
    if (xhr.overrideMimeType) {
      xhr.overrideMimeType('text/javascript; charset=utf-8');
    }
    xhr.send(null);
    if (xhr.status !== 200) {
      throw new Error(kind + ' download failed: HTTP ' + xhr.status);
    }
    state[download.cacheKey] = xhr.responseText;
    return state[download.cacheKey];
  };

  X.downloadAsync = function (kind, callback) {
    var state = X.state;
    var download = X.downloads[kind];
    if (state[download.cacheKey]) {
      callback(null, state[download.cacheKey]);
      return;
    }
    var queue = state.pending[kind] || (state.pending[kind] = []);
    queue.push(callback);
    if (queue.length > 1) {
      return;
    }
    var flush = function (err, text) {
      var callbacks = queue.splice(0, queue.length);
      for (var i = 0; i < callbacks.length; i++) {
        try {
          callbacks[i](err, text);
        } catch (e) {
          X.warn('callback error', e);
        }
      }
    };
    var xhr = new loaderWindow.XMLHttpRequest();
    xhr.open('GET', download.url(), true);
    if (xhr.overrideMimeType) {
      xhr.overrideMimeType('text/javascript; charset=utf-8');
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status === 200) {
        // A sync download may have filled the cache meanwhile: keep the first.
        state[download.cacheKey] = state[download.cacheKey] || xhr.responseText;
        flush(null, state[download.cacheKey]);
      } else {
        flush(new Error(kind + ' download failed: HTTP ' + xhr.status));
      }
    };
    xhr.send(null);
  };

  X.prefetch = function () {
    X.downloadAsync('polyfill', function (err) {
      X.addJournalEntry(err ? 'prefetch-error' : 'prefetched', null, err ? String(err.message || err) : '');
    });
  };

  X.polyfillOptionsFor = function (win, detection) {
    var config = X.state.config;
    return {
      onlyIfNeeded: config.mode !== 'always',
      autoload: !!(detection && detection.signals && detection.signals.xmlStylesheetPI),
      debug: !!config.debug
    };
  };

  // Runs the polyfill source in the global scope of `win` (indirect eval in
  // that realm), so `window`, `document`, `XSLTProcessor` are the target's.
  // Returns true when our polyfill is installed in `win`. Outside 'always'
  // mode, returns false and leaves `win` alone when a usable XSLTProcessor
  // (native or third-party shim) appeared since detection, e.g. while the
  // source was downloading: upstream only recognizes the native one.
  X.evalPolyfill = function (win, source, detection) {
    if (X.isPolyfilled(win)) {
      return true;
    }
    var Processor = win.XSLTProcessor;
    if (Processor && Processor.__bnzStub) {
      // Let the polyfill see "no native support" and install over the stub.
      try {
        delete win.XSLTProcessor;
      } catch (e) {
        win.XSLTProcessor = undefined;
      }
    } else if (X.state.config.mode !== 'always' && X.isXsltUsable(win)) {
      X.addJournalEntry('polyfill-skipped', win, 'usable XSLTProcessor present');
      return false;
    }
    win.bnzXsltPatchPolyfillOptions = X.polyfillOptionsFor(win, detection);
    win.eval(source);
    var installed = X.isPolyfilled(win) && typeof win.XSLTProcessor === 'function';
    X.addJournalEntry(installed ? 'polyfill-installed' : 'polyfill-not-installed', win);
    return installed;
  };

  X.installPolyfillSync = function (win, detection) {
    try {
      return X.evalPolyfill(win, X.downloadSync('polyfill'), detection);
    } catch (e) {
      X.warn('sync polyfill install failed', X.safeUrl(win), e);
      X.addJournalEntry('polyfill-error', win, String(e && e.message || e));
      return false;
    }
  };

  X.installPolyfillAsync = function (win, detection) {
    X.downloadAsync('polyfill', function (err, source) {
      if (err) {
        X.warn('async polyfill download failed', err);
        X.addJournalEntry('polyfill-error', win, String(err.message || err));
        return;
      }
      if (!X.docOf(win)) {
        return; // window closed or navigated cross-origin meanwhile
      }
      try {
        X.evalPolyfill(win, source, detection);
      } catch (e) {
        X.warn('async polyfill install failed', X.safeUrl(win), e);
        X.addJournalEntry('polyfill-error', win, String(e && e.message || e));
      }
    });
  };

  // Lazy stub: defines XSLTProcessor where it is missing. The first
  // `new XSLTProcessor()` installs the real polyfill synchronously (from the
  // prefetched text when available), then returns a real instance.
  // A page that kept a reference to the stub after a third-party shim
  // replaced it gets an instance of that shim (the polyfill is not installed).
  X.installStub = function (win, detection) {
    if (X.isXsltUsable(win) || X.isPolyfilled(win)) {
      return false;
    }
    if (win.XSLTProcessor && win.XSLTProcessor.__bnzStub) {
      return true;
    }
    var Stub = function XSLTProcessor() {
      if (!X.isPolyfilled(win) && !X.installPolyfillSync(win, detection) && !X.isXsltUsable(win)) {
        throw new Error(X.LOG_PREFIX + ' XSLT polyfill unavailable, see console.');
      }
      var Real = win.XSLTProcessor;
      if (typeof Real !== 'function' || Real === Stub) {
        throw new Error(X.LOG_PREFIX + ' XSLT polyfill did not install XSLTProcessor.');
      }
      return new Real();
    };
    Stub.__bnzStub = true;
    win.XSLTProcessor = Stub;
    X.addJournalEntry('stub-installed', win);
    return true;
  };

  // Public API of the loader copy living in `win`'s realm, if any.
  X.loaderApiOf = function (win) {
    try {
      var api = win.bnz && win.bnz.XsltPatch;
      return api && typeof api.bootstrap === 'function' && api.isLoader === true ? api : null;
    } catch (e) {
      return null;
    }
  };

  // Makes sure a loader copy runs in `win`'s own realm (evaluating the
  // loader web resource there if needed) and returns its public API.
  // The seed hands over what this copy already knows (client URL, sources).
  X.ensureLoaderIn = function (win) {
    var api = X.loaderApiOf(win);
    if (api) {
      return api;
    }
    if (!X.docOf(win)) {
      return null;
    }
    try {
      var source = X.downloadSync('loader');
      win[X.SEED_KEY] = {
        clientUrl: X.state.clientUrl,
        polyfillSource: X.state.polyfillSource,
        loaderSource: source,
        from: X.safeUrl(loaderWindow)
      };
      win.eval(source);
      api = X.loaderApiOf(win);
      X.addJournalEntry(api ? 'loader-injected' : 'loader-inject-failed', win);
      return api;
    } catch (e) {
      X.warn('loader injection failed', X.safeUrl(win), e);
      X.addJournalEntry('loader-inject-failed', win, String(e && e.message || e));
      return null;
    }
  };
