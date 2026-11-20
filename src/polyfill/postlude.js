
  // ---- end of vendor sources ----
  var polyfillInfo = window.__bnzXsltPolyfillLoaded;
  polyfillInfo.installed = !!window.xsltPolyfillInstalled;

  // DYN-010: give the page back the members upstream overwrote. The polyfill
  // calls its helpers by their lexical names, never through window.
  (function () {
    var sameDescriptor = function (a, b) {
      if (!a || !b) {
        return a === b;
      }
      return a.value === b.value && a.get === b.get && a.set === b.set;
    };
    var restore = function (target, name, saved) {
      if (sameDescriptor(Object.getOwnPropertyDescriptor(target, name) || null, saved)) {
        return false;
      }
      try {
        if (saved) {
          Object.defineProperty(target, name, saved);
        } else {
          delete target[name];
        }
      } catch (e) {
        // Non-configurable page global (`var showError`): still writable.
        try {
          if (saved && 'value' in saved) {
            target[name] = saved.value;
          }
        } catch (e2) { /* ignore */ }
      }
      return true;
    };
    var restored = [];
    Object.keys(bnzPageMembers.globals).forEach(function (name) {
      var saved = bnzPageMembers.globals[name];
      // A free name keeps upstream's documented helper, except showError: it
      // is not part of upstream's API and replaces the document's text.
      if ((saved.taken || name === 'showError') && restore(window, name, saved.own)) {
        restored.push(name);
      }
    });
    // createElement only needs the patch on the XML document being polyfilled
    // (same test as upstream's isXml). On an HTML page it only relays the call,
    // but it is no longer native (toString, stack traces).
    var type = '';
    try {
      type = Object.getOwnPropertyDescriptor(Document.prototype, 'contentType').get.call(document);
    } catch (e) { /* keep '' */ }
    var isXml = type === 'text/xml' || type === 'application/xml' || /\+xml$/.test(type);
    if (!isXml && bnzPageMembers.protoCreateElement) {
      if (restore(Document.prototype, 'createElement', bnzPageMembers.protoCreateElement)) {
        restored.push('Document.prototype.createElement');
      }
      if (restore(document, 'createElement', bnzPageMembers.docCreateElement)) {
        restored.push('document.createElement');
      }
    }
    polyfillInfo.restored = restored;
  })();

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
