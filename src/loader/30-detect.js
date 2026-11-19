  // ---- 30-detect ----
  // Step 1 of the patch: is XSLT present / needed in a given window?
  X.XSL_NS = 'http://www.w3.org/1999/XSL/Transform';
  X.XSL_PI_TYPES = ['text/xsl', 'application/xslt+xml', 'text/xml', 'application/xml'];

  // Returns the window's document, or null when cross-origin / closed.
  X.docOf = function (win) {
    try {
      if (!win || win.closed) {
        return null;
      }
      var doc = win.document;
      // Touch a property: throws on cross-origin.
      return doc && doc.documentElement !== undefined ? doc : null;
    } catch (e) {
      return null;
    }
  };

  // True when the window has a working XSLTProcessor we must not replace:
  // native implementation, our polyfill, or a third-party shim.
  X.isXsltUsable = function (win) {
    try {
      var P = win.XSLTProcessor;
      if (typeof P !== 'function' || P.__bnzStub) {
        return false;
      }
      // Chrome without XSLT may keep a constructor that throws.
      var probe = new P();
      return !!probe;
    } catch (e) {
      return false;
    }
  };

  X.isPolyfilled = function (win) {
    try {
      return !!win.__bnzXsltPolyfillLoaded;
    } catch (e) {
      return false;
    }
  };

  X.isXmlDocument = function (doc) {
    var type = String(doc.contentType || '').toLowerCase();
    return type === 'text/xml' || type === 'application/xml' || /\+xml$/.test(type);
  };

  // <?xml-stylesheet type="text/xsl" href="..."?> in the prolog (alternate="yes" ignored).
  X.hasXmlStylesheetPI = function (doc) {
    if (!X.isXmlDocument(doc)) {
      return false;
    }
    var nodes = doc.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 7 && n.target === 'xml-stylesheet') {
        var data = String(n.data || '');
        if (/alternate\s*=\s*["']yes["']/i.test(data)) {
          continue;
        }
        var m = /type\s*=\s*["']([^"']+)["']/i.exec(data);
        var type = m ? m[1].toLowerCase() : '';
        for (var j = 0; j < X.XSL_PI_TYPES.length; j++) {
          if (X.XSL_PI_TYPES[j] === type) {
            return true;
          }
        }
      }
    }
    return false;
  };

  // XSL elements in the DOM (data islands, inline stylesheets in <xml> or <script type="text/xml">).
  X.hasXslElements = function (doc) {
    try {
      if (doc.getElementsByTagNameNS(X.XSL_NS, '*').length > 0) {
        return true;
      }
      var islands = doc.querySelectorAll('xml, script[type="text/xml"], script[type="text/xsl"]');
      for (var i = 0; i < islands.length; i++) {
        var txt = islands[i].textContent || islands[i].innerHTML || '';
        if (txt.indexOf(X.XSL_NS) !== -1) {
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  };

  X.matchesAny = function (url, patterns) {
    var u = String(url || '').toLowerCase();
    patterns = patterns || [];
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i] && u.indexOf(String(patterns[i]).toLowerCase()) !== -1) {
        return true;
      }
    }
    return false;
  };

  X.isSsrsUrl = function (url) {
    return X.matchesAny(url, X.state.config.ssrsUrlPatterns);
  };

  X.isAdvancedFindUrl = function (url) {
    return X.matchesAny(url, X.state.config.advancedFindUrlPatterns);
  };

  X.needsPolyfill = function (win, usable) {
    var mode = X.state.config.mode;
    if (usable === undefined) {
      usable = X.isXsltUsable(win);
    }
    return mode === 'always' || (mode === 'auto' && !usable);
  };

  // Summary used by the injector to pick: nothing / lazy stub / eager polyfill.
  X.detect = function (win) {
    var doc = X.docOf(win);
    if (!doc) {
      return null;
    }
    var usable = X.isXsltUsable(win);
    var url = X.safeUrl(win);
    var signals = {
      xmlStylesheetPI: X.hasXmlStylesheetPI(doc),
      xslElements: X.hasXslElements(doc),
      ssrs: X.isSsrsUrl(url),
      advancedFind: X.isAdvancedFindUrl(url)
    };
    return {
      nativeUsable: usable,
      polyfilled: X.isPolyfilled(win),
      needsPolyfill: X.needsPolyfill(win, usable),
      eager: signals.xmlStylesheetPI || signals.xslElements || signals.ssrs || signals.advancedFind,
      signals: signals,
      readyState: doc.readyState
    };
  };
