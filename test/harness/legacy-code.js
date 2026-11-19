// Harness only: stands in for Dynamics legacy code that calls XSLTProcessor
// synchronously (what CRM 8.2-9.2 web client scripts do).
function harnessLoadXml(url) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.send(null);
  return new DOMParser().parseFromString(xhr.responseText, 'application/xml');
}

// responseXML keeps the stylesheet URL as baseURI (relative xsl:include).
function harnessLoadXmlDoc(url) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.send(null);
  return xhr.responseXML;
}

function harnessTransform(xslDoc, title) {
  var xml = harnessLoadXml('/data/sample.xml');
  var proc = new XSLTProcessor();
  proc.importStylesheet(xslDoc);
  if (title) {
    proc.setParameter(null, 'title', title);
  }
  var frag = proc.transformToFragment(xml, document);
  var holder = document.createElement('div');
  holder.appendChild(frag);
  var text = holder.textContent.replace(/\s+/g, ' ').trim();
  var out = document.getElementById('out');
  if (out) {
    out.textContent = text;
  }
  return text;
}

function harnessRunTransform(title) {
  return harnessTransform(harnessLoadXml('/data/sample.xsl'), title || 'Rapport');
}

function harnessRunIncludeTransform(title) {
  return harnessTransform(harnessLoadXmlDoc('/data/with-include.xsl'), title);
}
