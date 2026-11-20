/*!
 * bnz XSLT Patch - xslt-polyfill bundle {{BNZ_VERSION}} (polyfill {{POLYFILL_VERSION}})
 * Contains xslt_polyfill, Copyright (c) 2025 Mason Freed, BSD-3-Clause.
 * Contains libxml2 and libxslt (MIT), compiled to WebAssembly.
 * See vendor/xslt_polyfill/LICENSE and vendor/xslt_polyfill/DYNAMICS_PATCHES.md.
 */
(function () {
  // DYN-002: one install per realm, whatever the number of injections.
  if (window.__bnzXsltPolyfillLoaded) {
    return;
  }
  window.__bnzXsltPolyfillLoaded = {
    version: '{{BNZ_VERSION}}',
    polyfillVersion: '{{POLYFILL_VERSION}}',
    loadedAt: new Date().toISOString()
  };

  // DYN-001: hide AMD/CommonJS from the emscripten glue. Dynamics pages that
  // load RequireJS would otherwise get an anonymous define() and throw
  // "Mismatched anonymous define() module".
  // eslint-disable-next-line no-unused-vars
  var define, module, exports;

  // DYN-003: per-window options set by the loader, read once, then removed.
  var loaderOptions = window.bnzXsltPatchPolyfillOptions || {};
  try {
    delete window.bnzXsltPatchPolyfillOptions;
  } catch (e) {
    window.bnzXsltPatchPolyfillOptions = undefined;
  }
  // "Embedder" options, see vendor/xslt_polyfill/README.md, section
  // "Setting Options Without Globals".
  // eslint-disable-next-line no-unused-vars
  var xsltPolyfillOptions = {
    xsltUsePolyfillOnlyIfNeeded: loaderOptions.onlyIfNeeded !== false,
    xsltDontAutoloadXmlDocs: !loaderOptions.autoload,
    xsltPolyfillQuiet: !loaderOptions.debug
  };

  // DYN-010: upstream assigns its helpers to window unconditionally, and patches
  // createElement even on HTML pages. Snapshot what the page has before the
  // vendor code runs; postlude.js puts the page's own members back.
  // Names are prefixed: the emscripten glue shares this function scope.
  var bnzPageMembers = {
    globals: {},
    protoCreateElement: null,
    docCreateElement: null
  };
  ['parseAndReplaceCurrentXMLDoc', 'loadXmlWithXsltFromBytes', 'loadXmlWithXsltFromUrl',
    'loadXmlUrlWithXsltWhenReady', 'showError'].forEach(function (name) {
    var own = Object.getOwnPropertyDescriptor(window, name);
    // `in` also sees names owned up the prototype chain (named elements on
    // WindowProperties), without calling any getter.
    bnzPageMembers.globals[name] = { own: own || null, taken: !!own || name in window };
  });
  try {
    bnzPageMembers.protoCreateElement = Object.getOwnPropertyDescriptor(Document.prototype, 'createElement') || null;
    bnzPageMembers.docCreateElement = Object.getOwnPropertyDescriptor(document, 'createElement') || null;
  } catch (e) { /* no Document interface: nothing to restore */ }

  // ---- vendor/xslt_polyfill/dist/xslt-wasm.js ----
