// The compiled admin bundle attaches the JWT to outgoing requests but never
// reacts to a 401 response (expired/invalid session) - it just leaves the
// current page rendered with empty data. This patch watches every /api/
// request (axios uses the XHR transport; our own admin/*.js patch scripts
// use fetch) and forces a clean re-login as soon as one comes back 401,
// instead of silently failing.
(function () {
  'use strict';

  var redirected = false;

  function isLoginEndpoint(url) {
    // A 401 from the login/register endpoint itself just means "wrong
    // credentials" - that is not an expired session, so don't redirect.
    return /\/api\/admin\/auth\/(login|register)(\?|$)/.test(url || '');
  }

  function handleUnauthorized(url) {
    if (redirected) return;
    if (typeof url !== 'string' || url.indexOf('/api/') === -1) return;
    if (isLoginEndpoint(url)) return;
    redirected = true;
    try { localStorage.removeItem('auth'); } catch (_) { /* ignore */ }
    if (!/\/admin\/login/.test(location.pathname)) {
      location.href = '/admin/login';
    }
  }

  // --- XHR (the admin bundle's axios instance sends requests this way) ---
  var OrigOpen = XMLHttpRequest.prototype.open;
  var OrigSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._seUrl = url;
    return OrigOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener('loadend', function () {
      if (xhr.status === 401) handleUnauthorized(xhr._seUrl);
    });
    return OrigSend.apply(this, arguments);
  };

  // --- fetch (used by our own admin/*.js patch scripts) ---
  var origFetch = window.fetch;
  window.fetch = function (input) {
    return origFetch.apply(this, arguments).then(function (res) {
      if (res && res.status === 401) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        handleUnauthorized(url);
      }
      return res;
    });
  };
})();
