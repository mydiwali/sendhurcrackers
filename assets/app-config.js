// Single source of truth for which API domain the whole frontend talks to.
// Every page (customer site, admin panel, payments page) loads this first
// and reads window.APP_CONFIG instead of hardcoding the domain itself.
(function (global) {
  'use strict';

  var isLocal = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname);
  // API is always same-origin as whatever domain is currently serving the
  // frontend — never a fixed production domain, so this works on any domain
  // the site is deployed to without code changes.
  var apiOrigin = location.origin;
  // Matches an absolute "<any-domain>/api" URL so local dev can rewrite stale
  // hardcoded references (e.g. from browser/CDN cache of an old bundle) back
  // to localhost, regardless of which production domain they point to.
  var PROD_API_RE = isLocal ? /^https?:\/\/(?!localhost|127\.0\.0\.1|\[?::1\]?)[^\/]+\/api/i : null;

  global.APP_CONFIG = {
    isLocal: isLocal,
    prodApiRegex: PROD_API_RE,
    apiOrigin: apiOrigin,
    apiBaseUrl: apiOrigin + '/api'
  };
})(window);
