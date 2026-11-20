  // ---- 10-config ----
  // Tokens {{...}} are replaced by scripts/build.mjs.
  X.buildInfo = {
    version: '{{BNZ_VERSION}}',
    // Value of the ?ver= cache-buster on the URLs the loader builds. Set per
    // target by the build: the solution version, or an integer on CRM 8.2,
    // which answers HTTP 500 to a non-integer ver (#13).
    webResourceVer: '{{WEBRESOURCE_VER}}',
    polyfillVersion: '{{POLYFILL_VERSION}}',
    polyfillWebResource: '{{POLYFILL_WEBRESOURCE}}',
    loaderWebResource: '{{LOADER_WEBRESOURCE}}',
    buttonIdFragment: 'bnz.XsltPatch.Button'
  };

  // Unique id of this loader copy (one copy per JS realm that evaluated it).
  X.copyId = 'c' + new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 8);

  X.STATE_KEY = '__bnzXsltPatchState';
  X.MARK_KEY = '__bnzXsltPatchMark';
  X.SEED_KEY = '__bnzXsltPatchSeed';
  X.RELOAD_KEY = 'bnz.xsltpatch.reloaded';
  X.STORAGE_CONFIG_KEY = 'bnz.xsltpatch.config';
  X.STORAGE_DEBUG_KEY = 'bnz.xsltpatch.debug';

  X.defaultConfig = {
    // 'auto'   : polyfill only where native XSLTProcessor is missing or broken.
    // 'always' : polyfill everywhere, even over native support (tests).
    // 'off'    : loader does nothing (kill switch without uninstalling).
    mode: 'auto',
    debug: false,
    // Keep the diagnostics button enabled (visible) on the command bar.
    showButton: false,
    watchFrames: true,
    watchPopups: true,
    // Evaluate a copy of the loader inside each popup (its own realm), so the
    // popup keeps patching its frames and its own popups (e.g. UCI ->
    // "Advanced Settings" -> Advanced Find) even if its ribbon never loads.
    propagateToPopups: true,
    // A popup whose loader starts late (its own ribbon) asks its opener to
    // take over (injecting the loader there if needed).
    adoptOpener: true,
    // Download the polyfill in the background at bootstrap, so lazy stubs
    // only eval (no synchronous download).
    prefetch: true,
    // Sweep of the whole window tree (root, frames, popups): fast during a
    // burst after a popup opens / a frame loads (to install the stub before
    // page scripts run), slow otherwise.
    sweepFastMs: 25,
    sweepSlowMs: 400,
    burstMs: 15000,
    popupMaxWatchMs: 4 * 60 * 60 * 1000,
    maxTrackedPopups: 20,
    // Lower-case substrings of URLs. Matching windows get the full polyfill
    // eagerly (stub + immediate install).
    ssrsUrlPatterns: [
      '/crmreports/',
      'reserved.reportviewerwebcontrol.axd',
      '/reportserver'
    ],
    advancedFindUrlPatterns: [
      'pagetype=advancedfind',
      '/advancedfind/'
    ],
    // Windows matching these patterns that were found already loaded without
    // XSLT (scripts already failed) are reloaded once, under watch.
    reloadIfMissedPatterns: [
      'pagetype=advancedfind',
      '/advancedfind/'
    ],
    // Stylesheet links that fail to load (404) and whose URL holds an LCID
    // segment right after one of these lower-case substrings are duplicated
    // with the fallback LCID. Dynamics online serves /_static/css/1036/cui.css
    // as 404 (only 1033 exists): the legacy ribbon then renders as raw text.
    // '' disables.
    cssFallbackLcid: '1033',
    cssFallbackPatterns: [
      '/_static/css/'
    ],
    // Hide the (disabled) diagnostics button in the legacy web client, where
    // disabled buttons stay visible.
    hideLegacyButton: true,
    maxLogEntries: 200
  };

  X.readJsonStorage = function (key) {
    try {
      var raw = loaderWindow.localStorage && loaderWindow.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  X.readConfig = function (root) {
    var config = {};
    var key;
    for (key in X.defaultConfig) {
      if (Object.prototype.hasOwnProperty.call(X.defaultConfig, key)) {
        config[key] = X.defaultConfig[key];
      }
    }
    var overrides = [];
    try {
      overrides.push(root.bnzXsltPatchConfig);
    } catch (e) { /* ignore */ }
    overrides.push(X.readJsonStorage(X.STORAGE_CONFIG_KEY));
    for (var i = 0; i < overrides.length; i++) {
      var override = overrides[i];
      if (!override || typeof override !== 'object') {
        continue;
      }
      for (key in override) {
        if (Object.prototype.hasOwnProperty.call(X.defaultConfig, key)) {
          config[key] = override[key];
        }
      }
    }
    try {
      if (loaderWindow.localStorage && loaderWindow.localStorage.getItem(X.STORAGE_DEBUG_KEY) === '1') {
        config.debug = true;
        config.showButton = true;
      }
    } catch (e) { /* ignore */ }
    return config;
  };
