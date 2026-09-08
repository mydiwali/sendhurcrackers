(function () {
  'use strict';

  // ─────── API Caching Layer (GET requests only, reduces duplicate calls) ───────
  var apiCache = new Map();
  var pendingRequests = new Map();
  var API_CACHE_MS = 45000;

  function getCacheKey(url, method) {
    return method.toUpperCase() + ' ' + String(url || '');
  }

  function shouldCache(url, method) {
    if (method.toUpperCase() !== 'GET') return false;
    return /\/api\/(products|categories|coupons|settings|orders)(\?|\/|$)/.test(String(url || ''));
  }

  function getCachedResponse(url, method) {
    var key = getCacheKey(url, method);
    var cached = apiCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.at > API_CACHE_MS) {
      apiCache.delete(key);
      return null;
    }
    return cached.value;
  }

  function setCachedResponse(url, method, data) {
    var key = getCacheKey(url, method);
    apiCache.set(key, { value: data, at: Date.now() });
  }

  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var method = ((init && init.method) || 'GET').toUpperCase();
      var url = typeof input === 'string' ? input : (input && input.url) || '';

      if (shouldCache(url, method)) {
        var cached = getCachedResponse(url, method);
        if (cached) {
          return Promise.resolve(cached);
        }

        var key = getCacheKey(url, method);
        if (pendingRequests.has(key)) {
          return pendingRequests.get(key);
        }

        var promise = origFetch.apply(this, arguments).then(function (res) {
          if (res.ok) {
            var cloned = res.clone();
            setCachedResponse(url, method, cloned);
          }
          pendingRequests.delete(key);
          return res;
        }).catch(function (err) {
          pendingRequests.delete(key);
          throw err;
        });

        pendingRequests.set(key, promise);
        return promise;
      }

      return origFetch.apply(this, arguments);
    };
  }

  // ─────── Helpers ───────
  function txt(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function money(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function findPlaceEnquiryButton() {
    var allButtons = Array.from(document.querySelectorAll('button'));
    for (var i = 0; i < allButtons.length; i++) {
      if (txt(allButtons[i]).indexOf('Place Enquiry') !== -1) return allButtons[i];
    }
    return null;
  }

  // Reads the cart directly from localStorage — this is the same source of
  // truth the checkout page itself uses, so it's 100% accurate regardless of
  // how the summary text is rendered on screen (no fragile DOM/text scraping).
  function readCart() {
    try {
      var raw = localStorage.getItem('cart');
      if (!raw) return { items: [], subtotal: 0 };
      var parsed = JSON.parse(raw);
      var items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
      var subtotal = items.reduce(function (sum, it) {
        return sum + (Number(it.price) || 0) * (Number(it.quantity) || 0);
      }, 0);
      return { items: items, subtotal: subtotal };
    } catch (_) {
      return { items: [], subtotal: 0 };
    }
  }

  function computeDiscount(coupon, subtotal) {
    if (!coupon) return 0;
    var type = String(coupon.type || '').toUpperCase();
    var discount = 0;
    if (type === 'PERCENTAGE' || type === 'PERCENT') {
      discount = (subtotal * (Number(coupon.value) || 0)) / 100;
      if (coupon.maxDiscountAmount) {
        discount = Math.min(discount, Number(coupon.maxDiscountAmount));
      }
    } else {
      discount = Number(coupon.value) || 0;
    }
    return Math.max(0, Math.min(discount, subtotal));
  }

  // couponState.coupon holds the RAW coupon record from the server so the
  // discount can always be recalculated fresh against the current cart total
  // (never a stale cached number).
  var couponState = { code: '', applied: false, coupon: null };

  async function validateAndApplyCoupon(code) {
    if (!code || code.length === 0) {
      throw new Error('Enter coupon code');
    }

    var res = await fetch('/api/coupons/validate?code=' + encodeURIComponent(code));
    var json = await res.json().catch(function () { return {}; });

    if (!res.ok || !json.valid || !json.data) {
      throw new Error('Invalid or expired coupon');
    }

    var coupon = json.data;
    var cart = readCart();

    if (coupon.minOrderValue && cart.subtotal < coupon.minOrderValue) {
      throw new Error('Coupon requires minimum order of ' + money(coupon.minOrderValue));
    }

    var discount = computeDiscount(coupon, cart.subtotal);
    if (discount <= 0) {
      throw new Error('Coupon is not applicable to this order');
    }

    couponState.code = coupon.code || code;
    couponState.applied = true;
    couponState.coupon = coupon;
  }

  function clearCoupon() {
    couponState.code = '';
    couponState.applied = false;
    couponState.coupon = null;
    var panel = document.getElementById('ce-coupon-summary');
    if (panel) panel.remove();
    var overlay = document.getElementById('ce-btn-overlay');
    if (overlay) overlay.remove();
  }

  // ─────── UI: Coupon input box (inserted once, never re-touched) ───────
  function renderCouponBox() {
    if (document.getElementById('ce-coupon-section')) return;

    var placeBtn = findPlaceEnquiryButton();
    if (!placeBtn) return;

    var couponSection = document.createElement('div');
    couponSection.id = 'ce-coupon-section';
    couponSection.style.cssText = 'margin:16px 0;padding:16px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(255,255,255,0.02);';

    couponSection.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:18px;">🎟️</span>
        <h3 style="margin:0;font-size:14px;font-weight:600;color:inherit;">Apply Coupon Code</h3>
      </div>
      <div style="display:flex;gap:8px;">
        <input id="ce-coupon-code" type="text" placeholder="Enter coupon code"
          style="flex:1;padding:10px 12px;border:1px solid rgba(59,130,246,0.25);border-radius:6px;background:rgba(30,50,80,0.5);color:inherit;font-size:14px;outline:none;" />
        <button id="ce-apply-coupon" type="button"
          style="background:#3b82f6;color:#fff;border:0;border-radius:6px;padding:10px 20px;cursor:pointer;font-weight:500;white-space:nowrap;font-size:14px;">Apply</button>
      </div>
    `;

    // Insert as a new sibling directly before the button. This only ADDS a
    // node — it never removes or rewrites any element React already owns —
    // so it cannot corrupt React's internal tree.
    placeBtn.parentElement.insertBefore(couponSection, placeBtn);

    var applyBtn = document.getElementById('ce-apply-coupon');
    var codeInput = document.getElementById('ce-coupon-code');

    if (applyBtn && codeInput) {
      codeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyBtn.click();
        }
      });

      applyBtn.addEventListener('click', async function () {
        applyBtn.disabled = true;
        var origText = applyBtn.textContent;
        applyBtn.textContent = 'Applying...';
        try {
          var code = (codeInput.value || '').trim().toUpperCase();
          await validateAndApplyCoupon(code);
          renderCouponSummary();
          codeInput.value = '';
        } catch (err) {
          clearCoupon();
          alert('✗ ' + (err && err.message ? err.message : 'Coupon apply failed'));
        } finally {
          applyBtn.disabled = false;
          applyBtn.textContent = origText;
        }
      });
    }
  }

  // ─────── UI: Discount summary panel — OUR OWN element only, inserted once
  // as a sibling of the coupon box. We only ever edit innerHTML of elements
  // WE created, never anything React rendered, so this is always safe. ───────
  function renderCouponSummary() {
    var couponSection = document.getElementById('ce-coupon-section');
    if (!couponSection || !couponState.applied || !couponState.coupon) return;

    var cart = readCart();
    var discount = computeDiscount(couponState.coupon, cart.subtotal);
    var finalPrice = Math.max(0, cart.subtotal - discount);

    var panel = document.getElementById('ce-coupon-summary');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'ce-coupon-summary';
      panel.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid rgba(34,197,94,0.25);';
      couponSection.appendChild(panel);
    }

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;font-size:13px;color:#9ca3af;margin-bottom:4px;">' +
        '<span>Subtotal</span><span>' + money(cart.subtotal) + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;color:#22c55e;font-weight:600;margin-bottom:8px;">' +
        '<span>Coupon "' + couponState.code + '" applied</span><span>- ' + money(discount) + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;color:#22c55e;border-top:1px dashed rgba(34,197,94,0.3);padding-top:8px;">' +
        '<span>Payable Amount</span><span>' + money(finalPrice) + '</span>' +
      '</div>';
  }

  // ─────── Overlay showing the discounted amount ON the Place Enquiry
  // button — implemented as a floating layer positioned exactly on top of
  // the real button (position:fixed, pointer-events:none so clicks pass
  // through to the real button underneath). This NEVER touches the
  // button's own DOM nodes, so it cannot corrupt React's tree the way
  // overwriting button.textContent did before. ───────
  function updateButtonOverlay() {
    var placeBtn = findPlaceEnquiryButton();
    var overlay = document.getElementById('ce-btn-overlay');

    if (!placeBtn || !couponState.applied || !couponState.coupon) {
      if (overlay) overlay.remove();
      return;
    }

    var cart = readCart();
    var discount = computeDiscount(couponState.coupon, cart.subtotal);
    var finalPrice = Math.max(0, cart.subtotal - discount);
    var rect = placeBtn.getBoundingClientRect();
    var btnStyle = window.getComputedStyle(placeBtn);

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ce-btn-overlay';
      overlay.style.cssText = 'position:fixed;pointer-events:none;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;z-index:9999;border-radius:' + btnStyle.borderRadius + ';';
      document.body.appendChild(overlay);
    }

    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.background = btnStyle.backgroundColor;
    overlay.style.color = btnStyle.color;
    overlay.style.fontSize = btnStyle.fontSize;
    overlay.style.opacity = btnStyle.opacity;
    overlay.style.display = rect.width > 0 ? 'flex' : 'none';
    overlay.textContent = '📦 Place Enquiry · ' + money(finalPrice);
  }

  // ─────── GST note on Enquiry Summary ───────
  // Adds a small "Prices exclude GST" note right under the existing
  // "Enquiry only — no payment collected online" text. Purely additive
  // (creates our own element once), so it can never corrupt the page.
  function findEnquiryNote() {
    var candidates = Array.from(document.querySelectorAll('p, span, div'));
    for (var i = 0; i < candidates.length; i++) {
      if (txt(candidates[i]).indexOf('Enquiry only') !== -1 && txt(candidates[i]).indexOf('no payment collected online') !== -1) {
        return candidates[i];
      }
    }
    return null;
  }

  function renderGstNote() {
    if (document.getElementById('ce-gst-note')) return;
    var note = findEnquiryNote();
    if (!note) return;

    var gstNote = document.createElement('p');
    gstNote.id = 'ce-gst-note';
    gstNote.textContent = 'Prices exclude GST';
    gstNote.style.cssText = note.style.cssText || '';
    gstNote.className = note.className || '';
    gstNote.style.marginTop = '4px';

    note.insertAdjacentElement('afterend', gstNote);
  }

  // ─────── Hide "Download Invoice" on the post-order success screen ───────
  // Customer should not be able to download an invoice right after placing
  // an enquiry (no payment has been collected / order not verified yet).
  function hideDownloadInvoiceButton() {
    var allButtons = Array.from(document.querySelectorAll('button'));
    for (var i = 0; i < allButtons.length; i++) {
      if (txt(allButtons[i]).indexOf('Download Invoice') !== -1) {
        allButtons[i].style.display = 'none';
      }
    }
  }

  function loop() {
    try {
      renderCouponBox();
      renderGstNote();
      hideDownloadInvoiceButton();
      if (couponState.applied) {
        // If cart items changed (qty updated etc.) the discount/final price
        // must be recalculated live — never a frozen value.
        renderCouponSummary();
        updateButtonOverlay();
      } else {
        var overlay = document.getElementById('ce-btn-overlay');
        if (overlay) overlay.remove();
      }
    } catch (_) { /* never let a UI glitch break the page */ }
  }

  // ─────── Intercept the actual order submission so the coupon + real
  // discounted total reach the server (this is what the DB/admin bill use —
  // client-side display alone was never enough). Axios (used by the app)
  // sends via XMLHttpRequest, so we patch that; fetch is also patched for
  // safety in case anything else places orders that way. ───────
  function buildOrderPatch(bodyStr) {
    if (!couponState.applied || !couponState.coupon) return null;
    try {
      var body = JSON.parse(bodyStr);
      var items = Array.isArray(body.items) ? body.items : [];
      var subtotal = items.reduce(function (sum, it) {
        return sum + (Number(it.price) || 0) * (Number(it.quantity) || 0);
      }, 0);
      var discount = computeDiscount(couponState.coupon, subtotal);
      if (discount <= 0) return null;

      body.couponCode = couponState.code;
      body.discountAmount = discount;
      body.subtotalAmount = subtotal;
      body.total = Math.max(0, subtotal - discount);
      return JSON.stringify(body);
    } catch (_) {
      return null;
    }
  }

  function isOrderCreateUrl(url, method) {
    if (method !== 'POST') return false;
    var path = String(url || '').split('?')[0];
    return /\/api\/orders\/?$/.test(path);
  }

  // XMLHttpRequest patch (axios transport)
  var OrigXhrOpen = XMLHttpRequest.prototype.open;
  var OrigXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._ceMethod = (method || '').toUpperCase();
    this._ceUrl = url || '';
    return OrigXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (isOrderCreateUrl(this._ceUrl, this._ceMethod) && typeof body === 'string') {
        var patched = buildOrderPatch(body);
        if (patched) {
          var self = this;
          this.addEventListener('load', function () {
            if (self.status >= 200 && self.status < 300) clearCoupon();
          });
          return OrigXhrSend.call(this, patched);
        }
      }
    } catch (_) { /* fall through to original body on any error */ }
    return OrigXhrSend.call(this, body);
  };

  // fetch patch (safety net, in case order placement ever uses fetch)
  var origFetch2 = window.fetch;
  window.fetch = function (input, init) {
    try {
      var method = ((init && init.method) || 'GET').toUpperCase();
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isOrderCreateUrl(url, method) && init && typeof init.body === 'string') {
        var patched = buildOrderPatch(init.body);
        if (patched) {
          init = Object.assign({}, init, { body: patched });
          return origFetch2.call(this, input, init).then(function (res) {
            if (res.ok) clearCoupon();
            return res;
          });
        }
      }
    } catch (_) { /* fall through */ }
    return origFetch2.apply(this, arguments);
  };

  var busy = false;
  setInterval(function () {
    if (busy) return;
    busy = true;
    try {
      loop();
    } finally {
      busy = false;
    }
  }, 1000);

  setTimeout(loop, 300);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loop);
  }

  // Keep the button overlay pixel-aligned during scroll/resize.
  window.addEventListener('scroll', function () {
    if (couponState.applied) updateButtonOverlay();
  }, { passive: true });
  window.addEventListener('resize', function () {
    if (couponState.applied) updateButtonOverlay();
  });
})();
