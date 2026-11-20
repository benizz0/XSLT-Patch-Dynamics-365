
  // ---- end of vendor sources ----
  var polyfillInfo = window.__bnzXsltPolyfillLoaded;
  polyfillInfo.installed = !!window.xsltPolyfillInstalled;

  // DYN-007: trace of XSLTProcessor calls (count + last errors with the
  // stylesheet involved), read by bnz.XsltPatch.diagnostics(). Errors are
  // always logged to the console: they are what is needed to fix the next
  // Dynamics-specific issue.
  (function () {
    var Processor = window.XSLTProcessor;
    if (!polyfillInfo.installed || typeof Processor !== 'function' || !Processor.prototype) {
      return;
    }
    polyfillInfo.calls = 0;
    polyfillInfo.errors = [];
    polyfillInfo.includes = window.__bnzXsltInlineReport || null;
    var describeNode = function (node) {
      try {
        var doc = node && node.nodeType === 9 ? node : node && node.ownerDocument;
        var root = node && node.nodeType === 9 ? node.documentElement : node;
        return (root ? root.nodeName : '?') + ' @ ' + ((doc && doc.baseURI) || '?');
      } catch (e) {
        return '?';
      }
    };
    ['importStylesheet', 'transformToFragment', 'transformToDocument'].forEach(function (name) {
      var original = Processor.prototype[name];
      if (typeof original !== 'function') {
        return;
      }
      Processor.prototype[name] = function (node) {
        polyfillInfo.calls++;
        if (name === 'importStylesheet') {
          try {
            this.__bnzStylesheet = describeNode(node);
          } catch (e) { /* ignore */ }
        }
        try {
          return original.apply(this, arguments);
        } catch (e) {
          var entry = {
            at: new Date().toISOString(),
            method: name,
            stylesheet: this.__bnzStylesheet || '?',
            source: name === 'importStylesheet' ? '' : describeNode(node),
            error: String((e && e.message) || e)
          };
          polyfillInfo.errors.push(entry);
          if (polyfillInfo.errors.length > 30) {
            polyfillInfo.errors.shift();
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
