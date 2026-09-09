(function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  if (!cfg || !cfg.isLocal) return;

  var prodApi = cfg.prodApiRegex;

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var finalUrl = url;
    try {
      if (typeof url === 'string' && prodApi.test(url)) {
        finalUrl = url.replace(prodApi, cfg.apiOrigin + '/api');
      }
    } catch (_) {}

    var args = Array.prototype.slice.call(arguments);
    args[1] = finalUrl;
    return originalOpen.apply(this, args);
  };

  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') {
          if (prodApi.test(input)) {
            input = input.replace(prodApi, cfg.apiOrigin + '/api');
          }
        } else if (input && typeof input.url === 'string' && prodApi.test(input.url)) {
          input = new Request(input.url.replace(prodApi, cfg.apiOrigin + '/api'), input);
        }
      } catch (_) {}
      return originalFetch.call(this, input, init);
    };
  }
})();
