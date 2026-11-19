/*!
 * bnz XSLT Patch - loader {{BNZ_VERSION}}
 * Ribbon entry point: bnz.XsltPatch.Ribbon.enable (EnableRule / CustomRule).
 * ES5 on purpose: the file is also parsed by IE11 on CRM 8.2, where it must no-op.
 */
var bnz = window.bnz = window.bnz || {};
bnz.XsltPatch = bnz.XsltPatch || {};

(function (ns, loaderWindow) {
  'use strict';

  // Same version already evaluated in this realm (Dynamics may load the
  // library again): keep the running copy, its hooks and observers.
  if (ns.isLoader === true && ns.version === '{{BNZ_VERSION}}') {
    return;
  }

  // Internal shared scope for all loader parts (concatenated by scripts/build.mjs).
  var X = {};
