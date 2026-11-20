  // ---- 60-css ----
  // Localized stylesheets missing on the server. Dynamics online 9.2 links
  // /_static/css/<lcid>/cui.css from legacy pages (Advanced Find, settings),
  // but only the 1033 copy exists: 1036 answers 404. Without cui.css the
  // legacy ribbon (CUI) renders as raw text and its hidden instruction span
  // prints "undefined" at the top of the page.
  // A failed <link rel="stylesheet"> whose URL matches a pattern gets a sibling
  // link to the same file under the fallback LCID. Detection is polled by the
  // sweeper (no listener: a listener from another realm would die with it).

  // URL of `href` with its LCID segment replaced, or null when `href` does not
  // match (pattern followed by "<digits>/") or already uses the fallback.
  X.cssFallbackHref = function (href, patterns, lcid) {
    var lowerHref = String(href || '').toLowerCase();
    for (var i = 0; i < patterns.length; i++) {
      var pattern = String(patterns[i] || '').toLowerCase();
      var patternIndex = pattern ? lowerHref.indexOf(pattern) : -1;
      if (patternIndex === -1) {
        continue;
      }
      var lcidStart = patternIndex + pattern.length;
      var lcidMatch = /^(\d+)\//.exec(lowerHref.slice(lcidStart));
      if (!lcidMatch || lcidMatch[1] === String(lcid)) {
        return null;
      }
      return href.slice(0, lcidStart) + lcid + href.slice(lcidStart + lcidMatch[1].length);
    }
    return null;
  };

  // 'loading', 'ok' or 'failed' for a same-origin stylesheet link.
  X.cssLinkStatus = function (win, link) {
    var httpStatus = 0;
    try {
      var entries = win.performance && win.performance.getEntriesByName ? win.performance.getEntriesByName(link.href) : [];
      if (entries.length && typeof entries[entries.length - 1].responseStatus === 'number') {
        httpStatus = entries[entries.length - 1].responseStatus;
      }
    } catch (e) { /* ignore */ }
    if (httpStatus >= 400) {
      return 'failed';
    }
    var sheet = link.sheet;
    if (!sheet) {
      return 'loading';
    }
    try {
      // Chrome keeps a sheet for a failed same-origin load, but its rules
      // cannot be read.
      return sheet.cssRules ? 'ok' : 'failed';
    } catch (e) {
      return 'failed';
    }
  };

  // Called on each sweep of a document until it is complete and settled.
  X.fixStylesheets = function (win, doc, mark) {
    var config = X.state.config;
    if (mark.cssDone || !config.cssFallbackLcid || !config.cssFallbackPatterns || !config.cssFallbackPatterns.length) {
      return;
    }
    var links;
    var origin;
    try {
      links = doc.querySelectorAll('link[rel~="stylesheet"]');
      origin = win.location.protocol + '//' + win.location.host;
    } catch (e) {
      return;
    }
    var stillLoading = false;
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      try {
        if (link.__bnzCssFallback || link.getAttribute('data-bnz-css-fallback')) {
          continue;
        }
        var href = link.href;
        if (String(href).indexOf(origin + '/') !== 0) {
          continue; // cross-origin: rules are never readable, skip
        }
        var fallbackHref = X.cssFallbackHref(href, config.cssFallbackPatterns, config.cssFallbackLcid);
        if (!fallbackHref) {
          continue;
        }
        var status = X.cssLinkStatus(win, link);
        if (status === 'loading') {
          stillLoading = true;
          continue;
        }
        link.__bnzCssFallback = true;
        if (status === 'ok') {
          continue;
        }
        var fallbackLink = doc.createElement('link');
        fallbackLink.rel = 'stylesheet';
        fallbackLink.type = 'text/css';
        fallbackLink.href = fallbackHref;
        fallbackLink.setAttribute('data-bnz-css-fallback', '1');
        link.parentNode.insertBefore(fallbackLink, link.nextSibling);
        mark.cssFallbacks = (mark.cssFallbacks || 0) + 1;
        X.addJournalEntry('css-fallback', win, fallbackHref);
      } catch (e) { /* never break the page */ }
    }
    if (!stillLoading && doc.readyState === 'complete') {
      mark.cssDone = true;
    }
  };
