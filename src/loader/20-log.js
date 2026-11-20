  // ---- 20-log ----
  X.LOG_PREFIX = '[bnz.XsltPatch]';

  X.safeUrl = function (win) {
    try {
      return String(win.location.href);
    } catch (e) {
      return '(cross-origin)';
    }
  };

  // Keeps a bounded journal on the shared state (read by diagnostics).
  X.addJournalEntry = function (action, win, detail) {
    var state = X.state;
    if (!state) {
      return;
    }
    state.journal.push({
      at: new Date().toISOString(),
      action: action,
      url: win ? X.safeUrl(win) : '',
      detail: detail || ''
    });
    var max = state.config.maxLogEntries;
    if (state.journal.length > max) {
      state.journal.splice(0, state.journal.length - max);
    }
    X.debug(action, win ? X.safeUrl(win) : '', detail || '');
  };

  X.debug = function () {
    if (!X.state || !X.state.config.debug || !loaderWindow.console) {
      return;
    }
    var args = Array.prototype.slice.call(arguments);
    args.unshift(X.LOG_PREFIX);
    loaderWindow.console.log.apply(loaderWindow.console, args);
  };

  X.warn = function () {
    if (!loaderWindow.console) {
      return;
    }
    var args = Array.prototype.slice.call(arguments);
    args.unshift(X.LOG_PREFIX);
    (loaderWindow.console.warn || loaderWindow.console.log).apply(loaderWindow.console, args);
  };
