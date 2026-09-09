// Single source of truth for which API domain the whole frontend talks to.
// Every page (customer site, admin panel, payments page) loads this first
// and reads window.APP_CONFIG instead of hardcoding the domain itself.
(function (global) {
  'use strict';

  var PROD_ORIGIN = 'https://mydiwalicrackers.com';
  var PROD_API_RE = /^https?:\/\/(www\.)?mydiwalicrackers\.com\/api/i;
  var isLocal = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname);
  var apiOrigin = isLocal ? location.origin : PROD_ORIGIN;

  global.APP_CONFIG = {
    isLocal: isLocal,
    prodOrigin: PROD_ORIGIN,
    prodApiRegex: PROD_API_RE,
    apiOrigin: apiOrigin,
    apiBaseUrl: apiOrigin + '/api'
  };
})(window);
