// Harness only: simulates a Chrome build without native XSLT, like Chrome
// after the removal. Must be the first script of every harness page.
// Leaves the patch's stub / polyfill alone if they were installed first.
(function () {
  var P = window.XSLTProcessor;
  if (P && !P.__bnzStub && !window.__bnzXsltPolyfillLoaded) {
    try {
      delete window.XSLTProcessor;
    } catch (e) {
      window.XSLTProcessor = undefined;
    }
  }
  window.__harnessNativeRemoved = !window.XSLTProcessor || !!window.XSLTProcessor.__bnzStub;
})();
