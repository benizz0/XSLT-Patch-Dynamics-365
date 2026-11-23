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

  // Issue #4: frame with an XSL island (eager install) whose polyfill
  // download is held until the page has installed a third-party shim.
  // The loader downloads with the root window's XMLHttpRequest; the cached
  // source is dropped so a real (held) download happens.
  async function runLateShimCase(mode) {
    var state = window.__bnzXsltPatchState;
    var savedMode = state.config.mode;
    var savedSource = state.polyfillSource;
    var RealXHR = window.XMLHttpRequest;
    var held = [];
    var GatedXHR = function () {
      this.readyState = 0;
      this.status = 0;
      this.responseText = '';
      this.onreadystatechange = null;
    };
    GatedXHR.prototype.open = function (method, url, async) { this.url = url; this.async = async !== false; };
    GatedXHR.prototype.overrideMimeType = function () {};
    GatedXHR.prototype.send = function () {
      var self = this;
      var finish = function () {
        var real = new RealXHR();
        real.open('GET', self.url, false);
        real.overrideMimeType('text/javascript; charset=utf-8');
        real.send(null);
        self.status = real.status;
        self.responseText = real.responseText;
        self.readyState = 4;
        if (self.onreadystatechange) self.onreadystatechange();
      };
      if (self.async) held.push(finish); else finish();
    };
    var frame = null;
    var result = { mode: mode };
    try {
      state.config.mode = mode;
      state.polyfillSource = null;
      window.XMLHttpRequest = GatedXHR;
      frame = document.createElement('iframe');
      frame.src = '/shim.html?mode=' + mode;
      frame.width = 600; frame.height = 60;
      document.getElementById('frames').appendChild(frame);
      await waitFor(function () {
        var doc = frame.contentDocument;
        var mark = doc && /shim\.html/.test(doc.URL) && doc.__bnzXsltPatchMark;
        return mark && mark.action === 'eager' && held.length > 0;
      }, 10000);
      window.XMLHttpRequest = RealXHR;
      var win = frame.contentWindow;
      var stubRef = win.XSLTProcessor;
      result.stubBefore = !!(stubRef && stubRef.__bnzStub);
      var shim = win.harnessInstallShim();
      var journalStart = state.journal.length;
      while (held.length) held.shift()();
      result.kept = win.XSLTProcessor === shim;
      result.polyfilled = !!win.__bnzXsltPolyfillLoaded;
      result.skipped = state.journal.slice(journalStart).some(function (entry) {
        return entry.action === 'polyfill-skipped' && /shim\.html/.test(entry.url);
      });
      if (result.kept) {
        var processor = new win.XSLTProcessor();
        processor.importStylesheet(harnessLoadXmlDoc('/data/sample.xsl'));
        result.works = processor.transformToFragment(win.document, win.document).textContent === 'SHIM';
        try {
          result.stubGivesShim = result.stubBefore && new stubRef() instanceof shim;
        } catch (e) {
          result.stubGivesShim = 'ERROR: ' + e.message;
        }
      }
    } catch (e) {
      result.error = e && e.message || String(e);
    } finally {
      window.XMLHttpRequest = RealXHR;
      while (held.length) held.shift()();
      state.config.mode = savedMode;
      state.polyfillSource = state.polyfillSource || savedSource;
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    }
    return result;
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

      // Issue #15 - DYN-010: upstream's window exports don't overwrite the page.
      var pageShowError = (function () {
        try { return window.showError(); } catch (e) { return 'ERROR: ' + e.message; }
      })();
      report('page showError kept after install (DYN-010)',
        pageShowError === 'page showError' && document.title.indexOf('XSLT Patch') === 0 ? 'pass' : 'fail', pageShowError);
      var namedElement = document.getElementById('loadXmlWithXsltFromBytes');
      report('named element global not shadowed (DYN-010)',
        window.loadXmlWithXsltFromBytes === namedElement ? 'pass' : 'fail', String(window.loadXmlWithXsltFromBytes));
      report('free helper name keeps upstream export (DYN-010)',
        typeof window.loadXmlWithXsltFromUrl === 'function' ? 'pass' : 'fail', typeof window.loadXmlWithXsltFromUrl);
      var nativeCreate = /\[native code\]/.test(Function.prototype.toString.call(Document.prototype.createElement)) &&
        !Object.prototype.hasOwnProperty.call(document, 'createElement');
      report('createElement left native on an HTML page (DYN-010)', nativeCreate ? 'pass' : 'fail',
        JSON.stringify(window.__bnzXsltPolyfillLoaded.restored));

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
      // Expected value checked against native libxslt 1.1.45.
      var includedImport = textTransform('/data/precedence-inc-import.xsl', '<r><x/><y/><z/><v/><w/></r>');
      report('import inside an include, negative priority, modes (DYN-006)',
        includedImport === 'J;My;Mz;Iv;Jw;Mm;' ? 'pass' : 'fail', includedImport);

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

      // Rendering: XSLT output inserted in the page lays out as an HTML table
      // and takes the page's CSS (wrong namespace = unstyled inline text).
      var renderHost = document.createElement('div');
      document.getElementById('frames').appendChild(renderHost);
      var pageLayout = (function () {
        try {
          var processor = new XSLTProcessor();
          processor.importStylesheet(harnessLoadXmlDoc('/data/sample.xsl'));
          renderHost.appendChild(processor.transformToFragment(harnessLoadXml('/data/sample.xml'), document));
          var cells = renderHost.querySelectorAll('td');
          var style = getComputedStyle(cells[0]);
          var caption = renderHost.querySelector('caption');
          var problems = [];
          if (cells.length !== 6 || !(cells[0] instanceof HTMLTableCellElement)) problems.push('cells=' + cells.length);
          if (style.display !== 'table-cell') problems.push('display=' + style.display);
          if (style.paddingLeft !== '6px') problems.push('page CSS padding=' + style.paddingLeft);
          if (cells[0].offsetTop !== cells[1].offsetTop || cells[1].offsetLeft <= cells[0].offsetLeft) problems.push('row not laid out');
          if (cells[2].offsetTop <= cells[0].offsetTop) problems.push('rows not stacked');
          if (!caption || getComputedStyle(caption).display !== 'table-caption') problems.push('caption');
          return problems.join(', ');
        } catch (e) {
          return 'ERROR: ' + e.message;
        }
      })();
      report('render: fragment in the page laid out as a table, page CSS applied', pageLayout === '' ? 'pass' : 'fail', pageLayout);

      var frame = addFrame();
      await waitFor(function () { return frame.contentWindow && frame.contentWindow.harnessRunTransform && frame.contentDocument.readyState === 'complete'; }, 10000);
      await waitFor(function () { return frame.contentWindow.XSLTProcessor; }, 5000);
      check('dynamic iframe transform', frame.contentWindow.harnessRunTransform('Frame'), 'Frame');

      // <?xml-stylesheet?> document (eager install + upstream autoload).
      // DYN-010 must leave upstream's createElement patch on an XML document.
      var xmlFrame = document.createElement('iframe');
      xmlFrame.src = '/data/sample-pi.xml';
      xmlFrame.width = 600; xmlFrame.height = 80;
      document.getElementById('frames').appendChild(xmlFrame);
      var xmlRendered = await waitFor(function () {
        var doc = xmlFrame.contentDocument;
        var text = doc && doc.documentElement ? doc.documentElement.textContent : '';
        return /Rapport - Comptes/.test(text) && /Contoso\s*1200/.test(text) ? text : null;
      }, 20000).catch(function (e) { return 'ERROR: ' + e.message; });
      report('xml-stylesheet document rendered by the polyfill', /Rapport - Comptes/.test(xmlRendered) ? 'pass' : 'fail',
        String(xmlRendered).replace(/\s+/g, ' ').slice(0, 80));
      var xmlInfo = xmlFrame.contentWindow.__bnzXsltPolyfillLoaded || {};
      report('createElement patch kept on an XML document (DYN-010)',
        xmlInfo.installed === true && !!xmlInfo.restored &&
        xmlInfo.restored.indexOf('Document.prototype.createElement') === -1 &&
        xmlInfo.restored.indexOf('document.createElement') === -1 ? 'pass' : 'fail',
        JSON.stringify(xmlInfo.restored || null));

      // Rendering of an <?xml-stylesheet?> document replaced by the polyfill:
      // no leftover of Chrome's XML viewer styles, quirks rules of a doctype-less
      // HTML output emulated (the polyfilled document can't switch modes).
      var renderFrame = document.createElement('iframe');
      renderFrame.src = '/data/render.xml';
      renderFrame.width = 600; renderFrame.height = 200;
      document.getElementById('frames').appendChild(renderFrame);
      var renderDoc = await waitFor(function () {
        var doc = renderFrame.contentDocument;
        return doc && doc.getElementById('t') && doc.getElementById('p') && doc.title === 'Rendu' ? doc : null;
      }, 20000).catch(function () { return null; });
      if (!renderDoc) {
        report('render: xml-stylesheet document', 'fail', 'not rendered');
      } else {
        var renderWin = renderFrame.contentWindow;
        var css = function (id, selector) {
          var el = selector ? renderDoc.querySelector(selector) : renderDoc.getElementById(id);
          return renderWin.getComputedStyle(el);
        };
        var bodyStyle = renderWin.getComputedStyle(renderDoc.body);
        var tableStyle = css('t');
        var viewer = [];
        if (!(renderDoc.documentElement instanceof renderWin.HTMLHtmlElement)) viewer.push('not an HTML document');
        if (bodyStyle.marginLeft !== '8px' || bodyStyle.marginTop !== '8px') viewer.push('body margin=' + bodyStyle.marginTop + '/' + bodyStyle.marginLeft);
        if (tableStyle.whiteSpace !== 'normal') viewer.push('table white-space=' + tableStyle.whiteSpace);
        if (tableStyle.fontFamily !== bodyStyle.fontFamily) viewer.push('table font=' + tableStyle.fontFamily);
        if (css(null, 'td').verticalAlign !== 'middle') viewer.push('td vertical-align=' + css(null, 'td').verticalAlign);
        if (renderDoc.documentElement.attributes.length !== 0) viewer.push('html attributes left');
        report('render: no XML viewer style left on the polyfilled document', viewer.length ? 'fail' : 'pass', viewer.join(', '));
        var quirks = [];
        if (bodyStyle.fontSize !== '10px') quirks.push('body font-size=' + bodyStyle.fontSize);
        if (tableStyle.fontSize !== '16px') quirks.push('table font-size=' + tableStyle.fontSize + ' (quirks: medium)');
        // HTML spec, quirks lists: a loose li is "inside", a li in a list inherits "outside".
        if (css('loose').listStylePosition !== 'inside') quirks.push('loose li=' + css('loose').listStylePosition);
        if (css('listed').listStylePosition !== 'outside') quirks.push('li in ul=' + css('listed').listStylePosition);
        if (css('p').fontSize !== '10px') quirks.push('p font-size=' + css('p').fontSize);
        report('render: quirks rules of a doctype-less HTML output emulated (DYN-105)', quirks.length ? 'fail' : 'pass',
          quirks.join(', ') || 'compatMode=' + renderDoc.compatMode);
        var renderCells = renderDoc.querySelectorAll('td');
        var renderHeads = renderDoc.querySelectorAll('th');
        report('render: xml-stylesheet table laid out (header row, 2 rows)',
          renderHeads.length === 2 && renderCells.length === 4 && css(null, 'td').display === 'table-cell' &&
          renderCells[0].offsetTop === renderCells[1].offsetTop && renderCells[2].offsetTop > renderCells[0].offsetTop &&
          renderHeads[0].offsetTop < renderCells[0].offsetTop ? 'pass' : 'fail',
          renderDoc.getElementById('t').offsetWidth + 'x' + renderDoc.getElementById('t').offsetHeight);
      }

      // Issue #4 - a third-party shim appears while the eager polyfill is
      // still downloading: kept in 'auto' mode, replaced in 'always' mode.
      var shimAuto = await runLateShimCase('auto');
      report('late shim kept in auto mode (#4)',
        shimAuto.kept && shimAuto.works && !shimAuto.polyfilled && shimAuto.skipped ? 'pass' : 'fail', JSON.stringify(shimAuto));
      report('stub reference kept by the page returns the late shim (#4)',
        shimAuto.stubGivesShim === true ? 'pass' : 'fail', String(shimAuto.stubGivesShim));
      var shimAlways = await runLateShimCase('always');
      report('late shim replaced in always mode (#4)',
        !shimAlways.kept && shimAlways.polyfilled && !shimAlways.skipped ? 'pass' : 'fail', JSON.stringify(shimAlways));

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
        // DYN-008: without cui.css the ribbon was raw text, groups stacked.
        var ribbon = af.document.getElementById('crmRibbonManager');
        var groups = ribbon ? ribbon.querySelectorAll('.ms-cui-group') : [];
        report('render: legacy ribbon laid out (135 px, groups in one row, no bullets)',
          ribbon && ribbon.offsetHeight === 135 && groups.length === 3 &&
          groups[0].offsetTop === groups[2].offsetTop && groups[2].offsetLeft > groups[0].offsetLeft &&
          af.getComputedStyle(groups[0]).listStyleType === 'none' ? 'pass' : 'fail',
          ribbon ? 'height=' + ribbon.offsetHeight + ' tops=' + Array.prototype.map.call(groups, function (g) { return g.offsetTop; }).join(',') : 'no ribbon');
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

      // Issue #1 - same late Advanced Find, but the browser refuses the
      // replacement window (popup blocker, no user activation). The headless
      // browser runs with --disable-popup-blocking: the refusal is simulated
      // on the raw open the loader reopens with. The original window must stay
      // open and fall back to the bounded reload.
      var af4 = rawOpen.call(window, '/main.aspx?pagetype=advancedfind&case=blocked', 'bnzAF4', POPUP);
      if (af4) {
        await waitFor(afResult(af4), 20000).catch(function () { return null; });
        var calls = [];
        var hookedOpen = window.open;
        var savedOriginal = hookedOpen.__bnzOriginal;
        var realClose = af4.close;
        af4.close = function () { calls.push('close'); return realClose.apply(af4, arguments); };
        hookedOpen.__bnzOriginal = function () { calls.push('open'); return null; };
        var firstDoc = af4.document;
        try {
          xhr = new XMLHttpRequest();
          xhr.open('GET', '/WebResources/bnz_/xsltpatch/loader.js', false);
          xhr.send(null);
          af4.eval(xhr.responseText);
          af4.bnz.XsltPatch.Ribbon.enable();
        } finally {
          hookedOpen.__bnzOriginal = savedOriginal;
        }
        report('blocked reopen: replacement requested before any close',
          calls.join(',') === 'open' ? 'pass' : 'fail', calls.join(',') || 'no call');
        var firstMark = firstDoc.__bnzXsltPatchMark;
        var journal = window.__bnzXsltPatchState.journal;
        var blockedAt = -1;
        var reloadAt = -1;
        for (var ji = 0; ji < journal.length; ji++) {
          if (journal[ji].action === 'reopen-blocked' && /case=blocked/.test(journal[ji].url)) blockedAt = ji;
          if (journal[ji].action === 'reload' && /case=blocked/.test(journal[ji].url)) reloadAt = ji;
        }
        report('blocked reopen: falls back to the bounded reload',
          blockedAt !== -1 && reloadAt > blockedAt && firstMark && firstMark.action === 'reload' ? 'pass' : 'fail',
          'blocked=' + blockedAt + ' reload=' + reloadAt + ' mark=' + (firstMark ? firstMark.action : 'none'));
        var reloadedDoc = await waitFor(function () {
          return af4.document !== firstDoc && af4.document.readyState === 'complete' ? af4.document : null;
        }, 20000).catch(function () { return null; });
        report('blocked reopen: original window kept open and reloaded',
          !af4.closed && reloadedDoc ? 'pass' : 'fail', af4.closed ? 'closed' : (reloadedDoc ? 'reloaded' : 'not reloaded'));
        var guard = (function () {
          try { return JSON.parse(af4.sessionStorage.getItem('bnz.xsltpatch.reloaded') || '[]'); } catch (e) { return []; }
        })();
        report('blocked reopen: reload guard recorded (recovery at most once)',
          guard.some(function (u) { return /case=blocked/.test(u); }) ? 'pass' : 'fail', JSON.stringify(guard));
        af4.close();
      }

      // Runs the loader late in `win`, as its own ribbon would.
      var runLateLoader = function (win) {
        var request = new XMLHttpRequest();
        request.open('GET', '/WebResources/bnz_/xsltpatch/loader.js', false);
        request.send(null);
        win.eval(request.responseText);
        win.bnz.XsltPatch.Ribbon.enable();
      };
      // Last journal index of `action` for a URL matching `urlPattern`, or -1.
      var journalIndex = function (action, urlPattern) {
        var entries = window.__bnzXsltPatchState.journal;
        var found = -1;
        for (var k = 0; k < entries.length; k++) {
          if (entries[k].action === action && urlPattern.test(entries[k].url)) found = k;
        }
        return found;
      };

      // Issue #1 - the replacement opens, but the missed window refuses
      // window.close() (not script-closable, e.g. not opened by script): keep
      // the original, close the replacement, fall back to the bounded reload.
      var af5 = rawOpen.call(window, '/main.aspx?pagetype=advancedfind&case=closerefused', 'bnzAF5', POPUP);
      if (af5) {
        await waitFor(afResult(af5), 20000).catch(function () { return null; });
        var replacements = [];
        var openHook5 = window.open;
        var rawOriginal5 = openHook5.__bnzOriginal;
        af5.close = function () { /* refused */ };
        openHook5.__bnzOriginal = function () {
          var opened = rawOriginal5.apply(this, arguments);
          replacements.push(opened);
          return opened;
        };
        var firstDoc5 = af5.document;
        try {
          runLateLoader(af5);
        } finally {
          openHook5.__bnzOriginal = rawOriginal5;
        }
        report('close refused: replacement opened, then closed again',
          replacements.length === 1 && !!replacements[0] && replacements[0].closed === true ? 'pass' : 'fail',
          'opened=' + replacements.length + ' closed=' + (replacements[0] ? replacements[0].closed : 'n/a'));
        var refusedAt = journalIndex('reopen-close-refused', /case=closerefused/);
        var reload5At = journalIndex('reload', /case=closerefused/);
        report('close refused: falls back to the bounded reload',
          refusedAt !== -1 && reload5At > refusedAt ? 'pass' : 'fail', 'refused=' + refusedAt + ' reload=' + reload5At);
        var reloaded5 = await waitFor(function () {
          return af5.document !== firstDoc5 && af5.document.readyState === 'complete' ? af5.document : null;
        }, 20000).catch(function () { return null; });
        report('close refused: original window kept open and reloaded',
          !af5.closed && reloaded5 ? 'pass' : 'fail', af5.closed ? 'closed' : (reloaded5 ? 'reloaded' : 'not reloaded'));
        af5.close();
      }

      // Issue #1 - the reload guard is read before any reopen: a window whose
      // URL was already reloaded once is neither reopened nor reloaded again.
      var af6 = rawOpen.call(window, '/main.aspx?pagetype=advancedfind&case=guarded', 'bnzAF6', POPUP);
      if (af6) {
        await waitFor(afResult(af6), 20000).catch(function () { return null; });
        try {
          af6.sessionStorage.setItem('bnz.xsltpatch.reloaded', JSON.stringify([af6.location.href]));
        } catch (e) { /* the assertion below fails */ }
        var opens6 = 0;
        var openHook6 = window.open;
        var rawOriginal6 = openHook6.__bnzOriginal;
        openHook6.__bnzOriginal = function () { opens6++; return rawOriginal6.apply(this, arguments); };
        var firstDoc6 = af6.document;
        try {
          runLateLoader(af6);
        } finally {
          openHook6.__bnzOriginal = rawOriginal6;
        }
        await new Promise(function (resolve) { setTimeout(resolve, 500); });
        var skippedAt = journalIndex('reload-skipped', /case=guarded/);
        var mark6 = firstDoc6.__bnzXsltPatchMark;
        report('guarded URL: no reopen, no second reload (recovery at most once)',
          skippedAt !== -1 && opens6 === 0 && !af6.closed && af6.document === firstDoc6 && !!mark6 && mark6.action !== 'reload' ? 'pass' : 'fail',
          'skipped=' + skippedAt + ' opens=' + opens6 + ' mark=' + (mark6 ? mark6.action : 'none'));
        af6.close();
      }

      // Pages below follow shapes read on a 9.2 online org (see the comments
      // in viewer.aspx, QueryBuilder.aspx and mscrm-xsl.js).
      var fieldListOk = function (out) {
        return typeof out === 'string' && /<option [^>]*entityName="account"[^>]*>Nom<\/option>/.test(out);
      };
      var resultFrameOf = function (win) {
        var frameEl = win.document.getElementById('resultFrame');
        return frameEl && frameEl.contentWindow;
      };

      // SSRS viewer.aspx: filter summary through Mscrm.XslTemplate on load, then
      // the form posts into the static resultFrame.
      var rv = window.open('/crmreports/viewer/viewer.aspx?action=run', 'bnzReport2', POPUP);
      if (rv) {
        var posted = await waitFor(function () {
          var result = resultFrameOf(rv);
          return result && /\/reportviewer\.aspx$/.test(result.location.pathname) &&
            result.document.readyState === 'complete' ? result : null;
        }, 20000).catch(function () { return null; });
        report('viewer.aspx: filter summary, then POST into resultFrame',
          posted && /^<summary>accountid eq 1<\/summary>$/.test(rv.__viewerSummary) ? 'pass' : 'fail', String(rv.__viewerSummary));
        var rvInfo = rv.__bnzXsltPolyfillLoaded || {};
        report('viewer.aspx: XSLT calls traced, no error',
          rvInfo.calls >= 1 && rvInfo.errors && rvInfo.errors.length === 0 ? 'pass' : 'fail',
          'calls=' + rvInfo.calls + ' errors=' + (rvInfo.errors ? rvInfo.errors.length : 'n/a'));
        var rvMark = posted && posted.document.__bnzXsltPatchMark;
        report('reportviewer.aspx (POST navigation of a static iframe) processed',
          rvMark ? 'pass' : 'fail', rvMark ? rvMark.action : 'no mark');
        rv.close();
      }
      var rvRaw = rawOpen.call(window, '/crmreports/viewer/viewer.aspx?action=run&case=control', 'bnzReport3', POPUP);
      if (rvRaw) {
        var rawSummary = await waitFor(function () { return rvRaw.__viewerSummary; }, 20000).catch(function (e) { return 'TIMEOUT ' + e.message; });
        var rawResult = resultFrameOf(rvRaw);
        report('control: unpatched viewer.aspx never posts (blank report)',
          /^ERROR/.test(rawSummary) && rawResult && /\/blank\.htm$/.test(rawResult.location.pathname) ? 'pass' : 'fail', String(rawSummary));
        rvRaw.close();
      }

      // Advanced Find: contentIFrame0 in the markup, navigated by script; XSLT
      // on demand through Mscrm.XslTemplate.
      var af7 = window.open('/main.aspx?pagetype=advancedfind&shape=real', 'bnzAF7', POPUP);
      if (af7) {
        var qb7 = await waitFor(function () {
          var frameEl = af7.document.getElementById('contentIFrame0');
          var fw = frameEl && frameEl.contentWindow;
          return fw && fw.harnessGetFieldList && fw.document.readyState === 'complete' ? fw : null;
        }, 20000).catch(function () { return null; });
        var fields7 = qb7 ? qb7.harnessGetFieldList() : 'no frame';
        report('real-shape advanced find: field list through Mscrm.XslTemplate', fieldListOk(fields7) ? 'pass' : 'fail', fields7);
        var mark7 = qb7 && qb7.document.__bnzXsltPatchMark;
        report('contentIFrame0 (innerHTML, navigated by script) patched eagerly',
          mark7 && mark7.action === 'eager' ? 'pass' : 'fail', mark7 ? mark7.action + (mark7.missed ? ' (missed)' : '') : 'no mark');
        var staticFrames = qb7 ? ['resultFrame', 'downloadXmlFrame'].filter(function (id) {
          var el = qb7.document.getElementById(id);
          return el && el.contentDocument && el.contentDocument.__bnzXsltPatchMark;
        }) : [];
        report('static blank.htm iframes of the page processed', staticFrames.length === 2 ? 'pass' : 'fail', staticFrames.join(','));
        af7.close();
      }

      // Advanced Find in a tab of its own (no opener), as read on the org: the
      // ribbon library is evaluated in the advfind frame, but its Enable rule
      // never runs (known limit since 1.0.0.1: the patch comes from the opener's
      // injection). enable() called from that frame must bootstrap through a
      // copy in the root realm, then recover the frame once.
      var af8 = rawOpen.call(window, '/main.aspx?pagetype=advancedfind&shape=real&case=direct', 'bnzAF8', POPUP);
      if (af8) {
        try { af8.opener = null; } catch (e) { /* the adoption below would differ */ }
        var frame8 = await waitFor(function () {
          var frameEl = af8.document.getElementById('contentIFrame0');
          var fw = frameEl && frameEl.contentWindow;
          return fw && fw.harnessGetFieldList && fw.document.readyState === 'complete' ? fw : null;
        }, 20000).catch(function () { return null; });
        if (frame8) {
          var controlFields = frame8.harnessGetFieldList();
          report('control: field list fails without the patch', /^ERROR/.test(controlFields) ? 'pass' : 'fail', controlFields);
          var library = new XMLHttpRequest();
          library.open('GET', '/WebResources/bnz_/xsltpatch/loader.js', false);
          library.send(null);
          frame8.eval(library.responseText);
          report('ribbon library evaluated without enable(): no bootstrap (known limit, opener injection covers it)', 'info',
            'root state=' + !!af8.__bnzXsltPatchState + ' stub=' + typeof frame8.XSLTProcessor);
          var firstDoc8 = frame8.document;
          frame8.bnz.XsltPatch.Ribbon.enable();
          var rootState8 = af8.__bnzXsltPatchState;
          var frameCopy = frame8.bnz.XsltPatch.diagnostics().copyId;
          var rootCopy = af8.bnz && af8.bnz.XsltPatch && af8.bnz.XsltPatch.isLoader ? af8.bnz.XsltPatch.diagnostics().copyId : null;
          report('enable() in a frame realm delegates to a copy in the root realm',
            rootState8 && rootState8.active && rootCopy && rootState8.ownerId === rootCopy && frameCopy !== rootCopy ? 'pass' : 'fail',
            'owner=' + (rootState8 && rootState8.ownerId) + ' root=' + rootCopy + ' frame=' + frameCopy);
          var reloaded8 = await waitFor(function () {
            var doc = frame8.document;
            return doc !== firstDoc8 && doc.readyState === 'complete' && frame8.harnessGetFieldList &&
              typeof frame8.XSLTProcessor === 'function' ? frame8 : null;
          }, 20000).catch(function () { return null; });
          var reloadAt8 = rootState8 ? rootState8.journal.filter(function (entry) {
            return entry.action === 'reload' && /QueryBuilder\.aspx/.test(entry.url);
          }).length : 0;
          report('missed advfind frame reloaded once', reloaded8 && reloadAt8 === 1 ? 'pass' : 'fail', 'reloads=' + reloadAt8);
          var fields8 = reloaded8 ? reloaded8.harnessGetFieldList() : 'not reloaded';
          report('field list works after the recovery', fieldListOk(fields8) ? 'pass' : 'fail', fields8);
        } else {
          report('direct advanced find tab', 'fail', 'frame not loaded');
        }
        af8.close();
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
