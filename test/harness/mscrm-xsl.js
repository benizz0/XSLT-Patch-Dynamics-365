// Harness only: same shape as Dynamics' Mscrm.XslTemplate / Mscrm.XslProcessor
// (/_common/global.ashx, read on a 9.2 online org). What matters for the patch:
//  - the native / Internet Explorer choice is made at each createProcessor()
//    call, on `window.XSLTProcessor` of the calling realm: without it, the IE
//    branch runs and `ActiveXObject` throws a ReferenceError in Chrome;
//  - the result is a fragment of the INPUT document (DYN-009), serialized.
// Callers: cachemanager.js (Advanced Find field / entity lists, on demand) and
// reports.js (report filter summary, before viewer.aspx posts its form).
var Mscrm = window.Mscrm || {};

Mscrm.XslTemplate = function () {
  this.stylesheet = null;
};
Mscrm.XslTemplate.prototype.createProcessor = function () {
  if (window.XSLTProcessor) {
    return new Mscrm.XslProcessor(this.stylesheet);
  }
  return new Mscrm.InternetExplorerXslProcessor(this.stylesheet);
};

Mscrm.XslProcessor = function (stylesheet) {
  this._parameters = {};
  this._stylesheet = stylesheet;
  this.input = null;
  this.output = null;
};
Mscrm.XslProcessor.prototype.addParameter = function (name, value) {
  this._parameters[name] = value;
};
Mscrm.XslProcessor.prototype.transform = function () {
  var processor = new XSLTProcessor();
  processor.importStylesheet(this._stylesheet);
  for (var key in this._parameters) {
    processor.setParameter(null, key, this._parameters[key]);
  }
  var fragment = processor.transformToFragment(this.input, this.input);
  this.output = new XMLSerializer().serializeToString(fragment);
  return this.output;
};

// IE branch: unusable outside IE, as on the org.
Mscrm.InternetExplorerXslProcessor = function () {
  /* global ActiveXObject */
  this._stylesheet = new ActiveXObject('Msxml2.FreeThreadedDOMDocument');
};

function harnessXml(text) {
  return new DOMParser().parseFromString(text, 'text/xml');
}

// Runs `xslText` over `xmlText` the way Dynamics does; 'ERROR: ...' on failure.
function harnessMscrmTransform(xslText, xmlText) {
  try {
    var template = new Mscrm.XslTemplate();
    template.stylesheet = harnessXml(xslText);
    var processor = template.createProcessor();
    processor.input = harnessXml(xmlText);
    return processor.transform();
  } catch (e) {
    return 'ERROR: ' + e.message;
  }
}
