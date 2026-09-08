(function () {
  'use strict';

  var isLocal = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname);
  if (!isLocal) return;

  var prodApi = /^https?:\/\/(www\.)?mydiwalicrackers\.com\/api/i;

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var finalUrl = url;
    try {
      if (typeof url === 'string' && prodApi.test(url)) {
        finalUrl = url.replace(prodApi, location.origin + '/api');
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
            input = input.replace(prodApi, location.origin + '/api');
          }
        } else if (input && typeof input.url === 'string' && prodApi.test(input.url)) {
          input = new Request(input.url.replace(prodApi, location.origin + '/api'), input);
        }
      } catch (_) {}
      return originalFetch.call(this, input, init);
    };
  }
})();
