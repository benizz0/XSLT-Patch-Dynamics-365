
  // ---- end of vendor sources ----
  var bnzInfo = window.__bnzXsltPolyfillLoaded;
  bnzInfo.installed = !!window.xsltPolyfillInstalled;

  // DYN-007: trace of XSLTProcessor calls (count + last errors with the
  // stylesheet involved), read by bnz.XsltPatch.diagnostics(). Errors are
  // always logged to the console: they are what is needed to fix the next
  // Dynamics-specific issue.
  (function () {
    var P = window.XSLTProcessor;
    if (!bnzInfo.installed || typeof P !== 'function' || !P.prototype) {
      return;
    }
    bnzInfo.calls = 0;
    bnzInfo.errors = [];
    bnzInfo.includes = window.__bnzXsltInlineReport || null;
    var describe = function (node) {
      try {
        var doc = node && node.nodeType === 9 ? node : node && node.ownerDocument;
        var root = node && node.nodeType === 9 ? node.documentElement : node;
        return (root ? root.nodeName : '?') + ' @ ' + ((doc && doc.baseURI) || '?');
      } catch (e) {
        return '?';
      }
    };
    ['importStylesheet', 'transformToFragment', 'transformToDocument'].forEach(function (name) {
      var original = P.prototype[name];
      if (typeof original !== 'function') {
        return;
      }
      P.prototype[name] = function (node) {
        bnzInfo.calls++;
        if (name === 'importStylesheet') {
          try {
            this.__bnzStylesheet = describe(node);
          } catch (e) { /* ignore */ }
        }
        try {
          return original.apply(this, arguments);
        } catch (e) {
          var entry = {
            at: new Date().toISOString(),
            method: name,
            stylesheet: this.__bnzStylesheet || '?',
            source: name === 'importStylesheet' ? '' : describe(node),
            error: String((e && e.message) || e)
          };
          bnzInfo.errors.push(entry);
          if (bnzInfo.errors.length > 30) {
            bnzInfo.errors.shift();
          }
          if (window.console) {
            window.console.warn('[bnz.XsltPatch] XSLT ' + name + ' failed: ' + entry.error +
              ' | stylesheet: ' + entry.stylesheet + ' | url: ' + window.location.href);
          }
          throw e;
        }
      };
    });
  })();
})();
