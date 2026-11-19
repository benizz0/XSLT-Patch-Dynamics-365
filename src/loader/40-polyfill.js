  // ---- 40-polyfill ----
  // Step 2 of the patch: fetch the forked polyfill web resource and run it
  // inside a target window (its own JS realm). Also fetches the loader itself
  // to propagate it into popups / opener / root realms.

  X.getClientUrl = function () {
    var w = loaderWindow;
    try {
      if (w.Xrm && w.Xrm.Utility && typeof w.Xrm.Utility.getGlobalContext === 'function') {
        return w.Xrm.Utility.getGlobalContext().getClientUrl();
      }
    } catch (e) { /* 9.x API missing */ }
    try {
      if (w.Xrm && w.Xrm.Page && w.Xrm.Page.context) {
        return w.Xrm.Page.context.getClientUrl();
      }
    } catch (e) { /* 8.x API missing */ }
    try {
      if (typeof w.GetGlobalContext === 'function') {
        return w.GetGlobalContext().getClientUrl();
      }
    } catch (e) { /* not in a web resource */ }
    // Last resort: everything before "/WebResources/", "/main.aspx" or "/_..."
    var href = X.safeUrl(w);
    var m = /^(https?:\/\/[^\/]+(?:\/[^\/_][^\/]*)?)\/(?:WebResources|main\.aspx|_|uclient|form|crmreports|advancedfind|tools)/i.exec(href);
    if (m) {
      return m[1];
    }
    return w.location.protocol + '//' + w.location.host;
  };

  X.webResourceUrl = function (name) {
    var base = X.state.clientUrl.replace(/\/+$/, '');
    return base + '/WebResources/' + name + '?ver=' + encodeURIComponent(X.build.version);
  };

  X.polyfillUrl = function () {
    return X.webResourceUrl(X.build.polyfillWebResource);
  };

  X.loaderUrl = function () {
    return X.webResourceUrl(X.build.loaderWebResource);
  };

  // kind: 'polyfill' | 'loader'. Cached as text on the shared state.
  X.sources = {
    polyfill: { key: 'polyfillSource', url: function () { return X.polyfillUrl(); } },
    loader: { key: 'loaderSource', url: function () { return X.loaderUrl(); } }
  };

  // Synchronous fetch: the lazy stub must answer `new XSLTProcessor()` now.
  // DYN-004: XHR decodes JS as UTF-8, which the single-file wasm needs.
  X.loadSync = function (kind) {
    var state = X.state;
    var src = X.sources[kind];
    if (state[src.key]) {
      return state[src.key];
    }
    var xhr = new loaderWindow.XMLHttpRequest();
    xhr.open('GET', src.url(), false);
    if (xhr.overrideMimeType) {
      xhr.overrideMimeType('text/javascript; charset=utf-8');
    }
    xhr.send(null);
    if (xhr.status !== 200) {
      throw new Error(kind + ' download failed: HTTP ' + xhr.status);
    }
    state[src.key] = xhr.responseText;
    return state[src.key];
  };

  X.loadAsync = function (kind, callback) {
    var state = X.state;
    var src = X.sources[kind];
    if (state[src.key]) {
      callback(null, state[src.key]);
      return;
    }
    var queue = state.pending[kind] || (state.pending[kind] = []);
    queue.push(callback);
    if (queue.length > 1) {
      return;
    }
    var flush = function (err, text) {
      var list = queue.splice(0, queue.length);
      for (var i = 0; i < list.length; i++) {
        try {
          list[i](err, text);
        } catch (e) {
          X.warn('callback error', e);
        }
      }
    };
    var xhr = new loaderWindow.XMLHttpRequest();
    xhr.open('GET', src.url(), true);
    if (xhr.overrideMimeType) {
      xhr.overrideMimeType('text/javascript; charset=utf-8');
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status === 200) {
        // A sync load may have filled the cache meanwhile: keep the first.
        state[src.key] = state[src.key] || xhr.responseText;
        flush(null, state[src.key]);
      } else {
        flush(new Error(kind + ' download failed: HTTP ' + xhr.status));
      }
    };
    xhr.send(null);
  };

  X.prefetch = function () {
    X.loadAsync('polyfill', function (err) {
      X.record(err ? 'prefetch-error' : 'prefetched', null, err ? String(err.message || err) : '');
    });
  };

  X.polyfillOptionsFor = function (win, info) {
    var cfg = X.state.config;
    return {
      onlyIfNeeded: cfg.mode !== 'always',
      autoload: !!(info && info.signals && info.signals.xmlStylesheetPI),
      debug: !!cfg.debug
    };
  };

  // Runs the polyfill source in the global scope of `win` (indirect eval in
  // that realm), so `window`, `document`, `XSLTProcessor` are the target's.
  X.evalPolyfill = function (win, source, info) {
    if (X.isPolyfilled(win)) {
      return true;
    }
    var P = win.XSLTProcessor;
    if (P && P.__bnzStub) {
      // Let the polyfill see "no native support" and install over the stub.
      try {
        delete win.XSLTProcessor;
      } catch (e) {
        win.XSLTProcessor = undefined;
      }
    }
    win.bnzXsltPatchPolyfillOptions = X.polyfillOptionsFor(win, info);
    win.eval(source);
    var ok = X.isPolyfilled(win) && typeof win.XSLTProcessor === 'function';
    X.record(ok ? 'polyfill-installed' : 'polyfill-not-installed', win);
    return ok;
  };

  X.installPolyfillSync = function (win, info) {
    try {
      return X.evalPolyfill(win, X.loadSync('polyfill'), info);
    } catch (e) {
      X.warn('sync polyfill install failed', X.safeUrl(win), e);
      X.record('polyfill-error', win, String(e && e.message || e));
      return false;
    }
  };

  X.installPolyfillAsync = function (win, info) {
    X.loadAsync('polyfill', function (err, source) {
      if (err) {
        X.warn('async polyfill download failed', err);
        X.record('polyfill-error', win, String(err.message || err));
        return;
      }
      if (!X.docOf(win)) {
        return; // window closed or navigated cross-origin meanwhile
      }
      try {
        X.evalPolyfill(win, source, info);
      } catch (e) {
        X.warn('async polyfill install failed', X.safeUrl(win), e);
        X.record('polyfill-error', win, String(e && e.message || e));
      }
    });
  };

  // Lazy stub: defines XSLTProcessor where it is missing. The first
  // `new XSLTProcessor()` installs the real polyfill synchronously (from the
  // prefetched text when available), then returns a real instance.
  X.installStub = function (win, info) {
    if (X.isXsltUsable(win) || X.isPolyfilled(win)) {
      return false;
    }
    if (win.XSLTProcessor && win.XSLTProcessor.__bnzStub) {
      return true;
    }
    var Stub = function XSLTProcessor() {
      if (!X.isPolyfilled(win) && !X.installPolyfillSync(win, info)) {
        throw new Error(X.PREFIX + ' XSLT polyfill unavailable, see console.');
      }
      var Real = win.XSLTProcessor;
      if (typeof Real !== 'function' || Real === Stub) {
        throw new Error(X.PREFIX + ' XSLT polyfill did not install XSLTProcessor.');
      }
      return new Real();
    };
    Stub.__bnzStub = true;
    win.XSLTProcessor = Stub;
    X.record('stub-installed', win);
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
      var source = X.loadSync('loader');
      win[X.SEED_KEY] = {
        clientUrl: X.state.clientUrl,
        polyfillSource: X.state.polyfillSource,
        loaderSource: source,
        from: X.safeUrl(loaderWindow)
      };
      win.eval(source);
      api = X.loaderApiOf(win);
      X.record(api ? 'loader-injected' : 'loader-inject-failed', win);
      return api;
    } catch (e) {
      X.warn('loader injection failed', X.safeUrl(win), e);
      X.record('loader-inject-failed', win, String(e && e.message || e));
      return null;
    }
  };
