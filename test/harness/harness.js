// Harness driver. Manual buttons + ?autotest=1 (used with a headless browser).
(function () {
  var EXPECTED = 'Contoso 1200 Fabrikam 800 Éléonore & fils 430';
  var results = [];
  var resultsEl = document.getElementById('results');
  document.getElementById('removed').textContent = String(window.__harnessNativeRemoved);

  function report(name, status, detail) {
    results.push({ name: name, status: status, detail: detail || '' });
    var line = document.createElement('div');
    line.className = status;
    line.textContent = status.toUpperCase() + '  ' + name + (detail ? '  - ' + detail : '');
    resultsEl.appendChild(line);
  }
  function check(name, text, title) {
    var ok = typeof text === 'string' && text.indexOf(title + ' - Comptes') === 0 && text.indexOf(EXPECTED) !== -1;
    report(name, ok ? 'pass' : 'fail', String(text));
  }
  function waitFor(fn, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      (function poll() {
        var v;
        try { v = fn(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(poll, 50);
      })();
    });
  }
  function addFrame() {
    var f = document.createElement('iframe');
    f.src = '/frame.html';
    f.width = 600; f.height = 120;
    document.getElementById('frames').appendChild(f);
    return f;
  }

  document.getElementById('b-enable').onclick = function () { report('enable', 'pass', String(bnz.XsltPatch.Ribbon.enable())); };
  document.getElementById('b-top').onclick = function () { check('top manual', harnessRunTransform('Top'), 'Top'); };
  document.getElementById('b-frame').onclick = addFrame;
  document.getElementById('b-popup').onclick = function () { window.open('/crmreports/viewer/viewer.html', 'bnzReport', 'width=700,height=300'); };
  document.getElementById('b-diag').onclick = function () { bnz.XsltPatch.Ribbon.showDiagnostics(); };

  async function autotest() {
    try {
      // Environment: is native XSLT present outside the harness pages?
      var probe = (function () {
        try {
          var append = Node.prototype.appendChild.__bnzOriginal || Node.prototype.appendChild;
          var blankFrame = document.createElement('iframe');
          append.call(document.body, blankFrame);
          var Processor = blankFrame.contentWindow.XSLTProcessor;
          var kind = Processor ? (Processor.__bnzStub ? 'stub' : 'native') : 'none';
          blankFrame.parentNode.removeChild(blankFrame);
          return kind;
        } catch (e) {
          return 'error ' + e.message;
        }
      })();
      report('environment: XSLTProcessor in a fresh about:blank = ' + probe, 'info', navigator.userAgent);
      var enabled = bnz.XsltPatch.Ribbon.enable();
      report('enable rule returns false (button hidden)', enabled === false ? 'pass' : 'fail', String(enabled));
      var stub = window.XSLTProcessor && window.XSLTProcessor.__bnzStub;
      report('lazy stub installed in top', stub ? 'pass' : 'fail');

      check('top transform through stub', harnessRunTransform('Top'), 'Top');
      report('polyfill installed in top', window.__bnzXsltPolyfillLoaded ? 'pass' : 'fail',
        JSON.stringify(window.__bnzXsltPolyfillLoaded));
      report('AMD define() not called (DYN-001)', window.__amdCalls === 0 ? 'pass' : 'fail', 'calls=' + window.__amdCalls);

      // 1.0.0.3 - DYN-006: synchronous transform with xsl:import + xsl:include.
      var includeResult = (function () { try { return harnessRunIncludeTransform('Inc'); } catch (e) { return 'ERROR: ' + e.message; } })();
      check('sync xsl:include + xsl:import (DYN-006)', includeResult, 'Inc');
      report('import precedence + inlined namespace (math:max)',
        /max=1200$/.test(includeResult) && includeResult.indexOf('BASE') === -1 ? 'pass' : 'fail', includeResult);

      // Issue #5 - DYN-006: import precedence is compared before priority.
      var textTransform = function (xslUrl, xmlText) {
        try {
          var processor = new XSLTProcessor();
          processor.importStylesheet(harnessLoadXmlDoc(xslUrl));
          var input = new DOMParser().parseFromString(xmlText, 'text/xml');
          var holder = document.createElement('div');
          holder.appendChild(processor.transformToFragment(input, document));
          return holder.textContent.replace(/\s+/g, '');
        } catch (e) {
          return 'ERROR: ' + e.message;
        }
      };
      var localWins = textTransform('/data/precedence-priority.xsl', '<item/>');
      report('local rule beats imported priority="10" (issue #5)', localWins === 'MAIN' ? 'pass' : 'fail', localWins);
      var precedence = textTransform('/data/precedence.xsl', '<root><a/><b/><c/><d/><e/><f/></root>');
      report('nested + successive imports, named templates, variables (issue #5)',
        precedence === 'A;Bb;Mc;P;Be;n-A1;|n-A|B' ? 'pass' : 'fail', precedence);
      var expandedNames = textTransform('/data/precedence-ns.xsl', '<x/>');
      report('named templates compared by expanded name (DYN-006)',
        expandedNames === 'Ra;Rb;over-main;' ? 'pass' : 'fail', expandedNames);

      // document() stays unsupported synchronously: clean error, and the Wasm
      // module must keep working for the next transform.
      var docErr = (function () {
        try { return 'NO ERROR: ' + harnessTransform(harnessLoadXmlDoc('/data/with-document.xsl')); } catch (e) { return 'ERROR: ' + e.message; }
      })();
      report('document() fails cleanly (known limitation)', /^ERROR/.test(docErr) ? 'pass' : 'fail', docErr);
      check('next transform still works after a failure', harnessRunTransform('After'), 'After');
      var errs = window.__bnzXsltPolyfillLoaded && window.__bnzXsltPolyfillLoaded.errors || [];
      report('XSLT error traced (DYN-007)', errs.length >= 1 && /with-document\.xsl/.test(errs[errs.length - 1].stylesheet) ? 'pass' : 'fail',
        errs.length ? errs[errs.length - 1].stylesheet + ' | ' + errs[errs.length - 1].error : 'none');
      var parsedReport = JSON.parse(bnz.XsltPatch.report());
      report('report() lists xslt errors', parsedReport.xsltErrors && parsedReport.xsltErrors.length >= 1 ? 'pass' : 'fail',
        'errors=' + (parsedReport.xsltErrors || []).length);

      // 1.0.0.5 - DYN-009: Advanced Find field list (cachemanager.js _getFieldList)
      // transforms into the input XMLDocument and reads optionsXML (case
      // sensitive) from the serialized result.
      var fieldList = (function () {
        try {
          var parser = new DOMParser();
          var xsl = parser.parseFromString(
            "<xsl:stylesheet xmlns:xsl='http://www.w3.org/1999/XSL/Transform' version='2.0'>" +
            "<xsl:output method='xml' omit-xml-declaration='yes'/>" +
            "<xsl:template match='/fields'><xsl:apply-templates select='result'/></xsl:template>" +
            "<xsl:template match='result'><option><xsl:apply-templates select='@*'/><xsl:value-of select='.'/></option></xsl:template>" +
            "<xsl:template match='@*'><xsl:attribute name='{name()}'><xsl:value-of select='.'/></xsl:attribute></xsl:template>" +
            '</xsl:stylesheet>', 'text/xml');
          var input = parser.parseFromString(
            "<fields><result value='type' datatype='picklist' optionsXML='&lt;options&gt;&lt;option value=\"1\"&gt;A&lt;/option&gt;&lt;/options&gt;'>Type</result></fields>",
            'text/xml');
          var processor = new XSLTProcessor();
          processor.importStylesheet(xsl);
          var out = new XMLSerializer().serializeToString(processor.transformToFragment(input, input));
          var cache = parser.parseFromString('<fields>' + out + '</fields>', 'text/xml');
          var node = cache.getElementsByTagName('option')[0];
          var attr = node && node.attributes.getNamedItem('optionsXML');
          return {
            out: out,
            ok: !!attr && /<\s*option\s+value\s*=\s*(["|'])1\1\s*>/.test(attr.nodeValue) && out.indexOf('1999/xhtml') === -1
          };
        } catch (e) {
          return { out: 'ERROR: ' + e.message, ok: false };
        }
      })();
      report('fragment into XMLDocument keeps attribute case (DYN-009)', fieldList.ok ? 'pass' : 'fail', fieldList.out);
      var htmlFrag = (function () {
        try {
          var parser = new DOMParser();
          var xsl = parser.parseFromString(
            "<xsl:stylesheet xmlns:xsl='http://www.w3.org/1999/XSL/Transform' version='1.0'>" +
            "<xsl:output method='xml' omit-xml-declaration='yes'/>" +
            "<xsl:template match='/'><span dataX='1'>x</span></xsl:template></xsl:stylesheet>", 'text/xml');
          var processor = new XSLTProcessor();
          processor.importStylesheet(xsl);
          var span = processor.transformToFragment(parser.parseFromString('<a/>', 'text/xml'), document).firstChild;
          return span instanceof HTMLSpanElement && span.getAttribute('datax') === '1';
        } catch (e) {
          return false;
        }
      })();
      report('fragment into the HTML page stays HTML (upstream behaviour)', htmlFrag ? 'pass' : 'fail');

      var frame = addFrame();
      await waitFor(function () { return frame.contentWindow && frame.contentWindow.harnessRunTransform && frame.contentDocument.readyState === 'complete'; }, 10000);
      await waitFor(function () { return frame.contentWindow.XSLTProcessor; }, 5000);
      check('dynamic iframe transform', frame.contentWindow.harnessRunTransform('Frame'), 'Frame');

      var popup = window.open('/crmreports/viewer/viewer.html', 'bnzReport', 'width=700,height=300');
      if (!popup) {
        report('SSRS popup', 'skip', 'window.open blocked');
      } else {
        var viewerResult = await waitFor(function () { return popup.__viewerResult; }, 20000).catch(function (e) { return 'ERROR: ' + e.message; });
        check('SSRS popup transform (eager)', viewerResult, 'SSRS');
        var mark = popup.document.__bnzXsltPatchMark;
        report('SSRS popup marked eager', mark && mark.action === 'eager' ? 'pass' : 'fail', mark ? mark.action : 'no mark');
        popup.close();
      }

      var POPUP = 'width=700,height=300';
      var afResult = function (win) { return function () { return win.__afResult; }; };

      // 1.0.0.1 - Advanced Find opened through the hooked window.open: XSLT is
      // called while AdvFind.aspx parses (inside an iframe of the popup).
      var af = window.open('/main.aspx?pagetype=advancedfind', 'bnzAF1', POPUP);
      if (!af) {
        report('advanced find popup', 'skip', 'window.open blocked');
      } else {
        check('advanced find popup (XSLT during parsing)',
          await waitFor(afResult(af), 20000).catch(function (e) { return 'ERROR: ' + e.message; }), 'AF');
        report('loader copy propagated into the popup',
          af.bnz && af.bnz.XsltPatch && af.bnz.XsltPatch.isLoader ? 'pass' : 'fail');
        check('advanced find "ribbon" stylesheet with includes', af.__afRibbon, 'Ribbon');
        // 1.0.0.4 - /_static/css/1036/cui.css is a 404: fallback to 1033.
        var hidden = await waitFor(function () {
          var instruction = af.document.getElementById('ribboninstruction');
          return instruction && af.getComputedStyle(instruction).top === '-2000px' ? instruction : null;
        }, 10000).catch(function () { return null; });
        var fallbackLink = af.document.querySelector('link[data-bnz-css-fallback]');
        report('cui.css 404 -> 1033 fallback (ribbon styled)',
          hidden && fallbackLink && /\/_static\/css\/1033\/cui\.css\?ver=1$/.test(fallbackLink.href) ? 'pass' : 'fail',
          fallbackLink ? fallbackLink.getAttribute('href') : 'no fallback link');
        report('cui.css fallback added once',
          af.document.querySelectorAll('link[data-bnz-css-fallback]').length === 1 ? 'pass' : 'fail');
        af.close();
      }

      // 1.0.0.1 - UCI -> "Advanced Settings" (settings only, no ribbon) -> Advanced Find.
      var settings = window.open('/main.aspx?settingsonly=true', 'bnzSettings', POPUP);
      if (settings) {
        await waitFor(function () {
          return settings.bnz && settings.bnz.XsltPatch && settings.bnz.XsltPatch.isLoader && settings.open.__bnzHooked;
        }, 10000).catch(function () { return null; });
        report('settings-only window: window.open hooked by its own loader copy',
          settings.open.__bnzHooked && settings.open instanceof settings.Function ? 'pass' : 'fail');
        var af2 = settings.open('/main.aspx?pagetype=advancedfind', 'bnzAF2', POPUP);
        check('advanced find opened from settings only',
          await waitFor(afResult(af2), 20000).catch(function (e) { return 'ERROR: ' + e.message; }), 'AF');
        af2.close();
        settings.close();
      }

      // 1.0.0.1 - Advanced Find opened behind the patch's back (unhooked open):
      // it fails, then its own ribbon runs the loader late -> the opener
      // adopts it and reopens it once (same name), watched from about:blank.
      var rawOpen = window.open.__bnzOriginal || window.open;
      var af3 = rawOpen.call(window, '/main.aspx?pagetype=advancedfind', 'bnzAF3', POPUP);
      if (af3) {
        var before = await waitFor(afResult(af3), 20000).catch(function (e) { return 'ERROR: ' + e.message; });
        report('control: unpatched advanced find fails', /^ERROR/.test(before) ? 'pass' : 'fail', before);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/WebResources/bnz_/xsltpatch/loader.js', false);
        xhr.send(null);
        af3.eval(xhr.responseText);
        af3.bnz.XsltPatch.Ribbon.enable();
        await waitFor(function () { return af3.closed; }, 5000).catch(function () { return null; });
        report('late advanced find closed for recovery', af3.closed ? 'pass' : 'fail');
        var af3b = rawOpen.call(window, '', 'bnzAF3'); // same name: the reopened window
        check('late advanced find recovered (adoption + reopen)',
          await waitFor(afResult(af3b), 20000).catch(function (e) { return 'ERROR: ' + e.message; }), 'AF');
        report('reopened window flagged (no second recovery)', af3b.__bnzRecovered === true ? 'pass' : 'fail');
        af3b.close();
      }
    } catch (e) {
      report('autotest crashed', 'fail', e && e.stack || String(e));
    }
    var failed = results.filter(function (r) { return r.status === 'fail'; }).length;
    document.title = 'AUTOTEST ' + (failed ? 'FAIL ' + failed : 'PASS') + ' (' + results.length + ')';
    window.__autotest = { failed: failed, results: results };
  }

  if (/[?&]autotest=1/.test(location.search)) {
    window.addEventListener('load', function () { setTimeout(autotest, 0); });
  }
})();
