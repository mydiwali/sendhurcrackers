// Patches the compiled admin bundle (no React source ships in this repo) to add
// a "Purchased Price" (cost) field on the Add/Edit Product form — internal only,
// never returned by the customer-facing API and never shown on the storefront.
// Also fixes the Order Detail "Sub Total"/"Discount" rows to show real values.
(function () {
  'use strict';

  const API_BASE = '/api';
  const COST_LABEL_TEXT = 'Original / Retail Price';
  const COST_INPUT_ID = 'pp-purchased-price-input';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  // Text of ONLY an element's direct text-node children (ignores text
  // contributed by nested child elements). Used to find genuine "label"
  // leaf elements (e.g. a lone <span>Discount</span>) without accidentally
  // matching a big wrapper div whose aggregated descendant text happens to
  // start with the same words.
  function ownText(el) {
    if (!el || !el.childNodes) return '';
    return Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim();
  }

  function findToken() {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        if (raw.startsWith('eyJ')) return raw;
        try {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === 'object') {
            if (typeof obj.accessToken === 'string' && obj.accessToken.startsWith('eyJ')) return obj.accessToken;
            if (typeof obj.token === 'string' && obj.token.startsWith('eyJ')) return obj.token;
          }
        } catch (_) { /* not json */ }
      }
    } catch (_) { /* localStorage unavailable */ }
    return '';
  }

  async function api(path, options) {
    const token = findToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options && options.headers ? options.headers : {});
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API_BASE + path, Object.assign({}, options || {}, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && (data.error || data.message)) || 'Request failed');
    return data;
  }

  function rupee(n) {
    return '\u20B9' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── 1) Purchased Price field on Add/Edit Product form ──────────────────────

  function extractProductId() {
    const m = location.pathname.match(/\/products\/([0-9a-fA-F-]{20,})\/edit/);
    if (m) return m[1];
    return location.pathname.replace(/\/+$/, '').endsWith('/products/new') ? 'new' : '';
  }

  function findRetailPriceLabel() {
    const labels = Array.from(document.querySelectorAll('label'));
    return labels.find((l) => text(l) === COST_LABEL_TEXT) || null;
  }

  function costFieldHtml() {
    return (
      '<div id="' + COST_INPUT_ID + '-wrap">' +
        '<label class="block text-sm font-medium text-gray-700 mb-1">Purchased Price (Cost)</label>' +
        '<div class="relative">' +
          '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">\u20B9</span>' +
          '<input id="' + COST_INPUT_ID + '" class="input pl-6" type="number" step="0.01" min="0" placeholder="0.00" />' +
        '</div>' +
        '<p class="text-xs text-gray-400 mt-1">Internal only \u2014 never shown to customers</p>' +
      '</div>'
    );
  }

  async function ensureProductFormPatch() {
    const label = findRetailPriceLabel();
    if (!label) return;

    const productId = extractProductId();
    let input = document.getElementById(COST_INPUT_ID);

    if (input && input.dataset.productId === productId && document.body.contains(input)) {
      return; // already patched for this product
    }

    const fieldWrapper = label.parentElement;
    const oldWrap = document.getElementById(COST_INPUT_ID + '-wrap');
    if (oldWrap) oldWrap.remove();
    fieldWrapper.insertAdjacentHTML('afterend', costFieldHtml());
    input = document.getElementById(COST_INPUT_ID);
    input.dataset.productId = productId;

    if (productId && productId !== 'new') {
      try {
        const res = await api('/admin/products/' + productId, { method: 'GET' });
        const val = res && res.data ? res.data.purchasedPrice : null;
        const stillThere = document.getElementById(COST_INPUT_ID);
        if (stillThere && stillThere.dataset.productId === productId) {
          stillThere.value = val !== null && val !== undefined ? String(val) : '';
        }
      } catch (err) {
        console.warn('Failed to load purchased price:', err.message || err);
      }
    }
  }

  // The compiled admin bundle's axios instance reads its API origin from
  // window.APP_CONFIG (assets/app-config.js) at load time, so it already
  // targets the right backend. This is a defense-in-depth net that rewrites
  // any request that still slips through with the production origin baked
  // in (e.g. a stale cached bundle) to the current origin during local dev.
  const IS_LOCAL_DEV = !!(window.APP_CONFIG && window.APP_CONFIG.isLocal);
  const PROD_API_RE = window.APP_CONFIG && window.APP_CONFIG.prodApiRegex;

  // Admin product save requests go through axios (XHR transport), so we splice
  // purchasedPrice into the outgoing JSON body right before it is sent.
  const OrigOpen = XMLHttpRequest.prototype.open;
  const OrigSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    let finalUrl = url;
    try {
      if (IS_LOCAL_DEV && PROD_API_RE && typeof url === 'string' && PROD_API_RE.test(url)) {
        finalUrl = url.replace(PROD_API_RE, location.origin + '/api');
      }
    } catch (_) { /* if rewrite fails, fall back to original url */ }
    this._ppMethod = (method || '').toUpperCase();
    this._ppUrl = finalUrl || '';
    const args = Array.prototype.slice.call(arguments);
    args[0] = method;
    args[1] = finalUrl;
    return OrigOpen.apply(this, args);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      const path = String(this._ppUrl || '').split('?')[0];
      const isProductSave = /\/admin\/products(\/[a-zA-Z0-9-]+)?$/.test(path) &&
        (this._ppMethod === 'POST' || this._ppMethod === 'PUT' || this._ppMethod === 'PATCH');
      if (isProductSave && typeof body === 'string') {
        const input = document.getElementById(COST_INPUT_ID);
        if (input) {
          const parsed = JSON.parse(body);
          parsed.purchasedPrice = input.value === '' ? null : Number(input.value);
          body = JSON.stringify(parsed);
        }
      }
    } catch (_) { /* if anything goes wrong, send the original body untouched */ }
    return OrigSend.call(this, body);
  };

  // ── 2) Order Detail: Full Summary (PDF) button ──────────────────────────────

  function extractPathOrderId() {
    const m = location.pathname.match(/\/orders\/([0-9a-fA-F-]{20,})/);
    return m ? m[1] : '';
  }

  function extractVisibleOrderNumber() {
    const h1s = Array.from(document.querySelectorAll('h1'));
    for (let i = 0; i < h1s.length; i += 1) {
      const m = text(h1s[i]).match(/ORD-\d+/i);
      if (m) return m[0].toUpperCase();
    }
    return '';
  }

  const orderIdByNumber = {};
  let orderListCacheAt = 0;
  let orderListInFlight = null;
  const ORDER_LIST_CACHE_MS = 60 * 1000;

  async function primeOrderIdMap() {
    const now = Date.now();
    if (now - orderListCacheAt < ORDER_LIST_CACHE_MS) return;
    if (orderListInFlight) return orderListInFlight;

    orderListInFlight = api('/admin/orders?size=200&page=0', { method: 'GET' })
      .then((list) => {
        const rows = list && list.data && Array.isArray(list.data.content) ? list.data.content : [];
        rows.forEach((r) => {
          if (r && r.orderNumber && r.id) {
            orderIdByNumber[String(r.orderNumber).toUpperCase()] = r.id;
          }
        });
        orderListCacheAt = Date.now();
      })
      .catch(() => { /* keep fallback behavior in resolveOrderTarget */ })
      .finally(() => { orderListInFlight = null; });

    return orderListInFlight;
  }

  async function resolveOrderTarget() {
    const id = extractPathOrderId();
    if (id) return { key: id, by: 'id', value: id };

    const orderNumber = extractVisibleOrderNumber();
    if (!orderNumber) return { key: '', by: '', value: '' };

    if (orderIdByNumber[orderNumber]) {
      return { key: orderNumber, by: 'id', value: orderIdByNumber[orderNumber] };
    }

    try {
      await primeOrderIdMap();
      if (orderIdByNumber[orderNumber]) {
        return { key: orderNumber, by: 'id', value: orderIdByNumber[orderNumber] };
      }
    } catch (_) { /* fallback below */ }

    return { key: orderNumber, by: 'orderNumber', value: orderNumber };
  }

  // The compiled bundle's order-detail "Item Details" tab and the invoice
  // preview modal both render a "Sub Total (X Items) / Discount / Total"
  // block, but "Sub Total" is wrongly computed from the already-discounted
  // total and "Discount" is hardcoded to "₹0.00". We fix those two rows
  // IN PLACE (update text only, never add/remove elements) using the real
  // values from the order record, which now includes discountAmount/
  // subtotalAmount/couponCode after the backend change.
  const orderMoneyCache = {};
  const ORDER_MONEY_CACHE_MS = 8000;

  async function fetchOrderMoney(target) {
    const now = Date.now();
    const cached = orderMoneyCache[target.key];
    if (cached && now - cached.at < ORDER_MONEY_CACHE_MS) return cached.data;

    const orderPath = target.by === 'id'
      ? '/admin/orders/' + target.value
      : '/orders/' + encodeURIComponent(target.value);
    const res = await api(orderPath, { method: 'GET' });
    const data = res && res.data ? res.data : null;
    orderMoneyCache[target.key] = { data, at: now };
    return data;
  }

  function findRowAmountElement(label) {
    const row = label.closest('tr') || label.parentElement;
    if (!row) return null;

    let amountEl = null;
    if (row.tagName === 'TR') {
      amountEl = row.querySelector('td:last-child,th:last-child');
    } else {
      const kids = Array.from(row.children).filter((n) => n.nodeType === 1);
      amountEl = kids.length ? kids[kids.length - 1] : null;
      if (amountEl === label && label.nextElementSibling) amountEl = label.nextElementSibling;
    }
    // Never write into a container that itself has nested elements — drill
    // down to the innermost leaf so we only ever touch a single text node.
    while (amountEl && amountEl.children && amountEl.children.length === 1) {
      amountEl = amountEl.children[0];
    }
    if (amountEl && amountEl.children && amountEl.children.length > 0) return { row, amountEl: null };
    return { row, amountEl };
  }

  function patchDiscountRows(order, orderKey) {
    const discount = Number(order && order.discountAmount || 0);
    const subtotal = order && order.subtotalAmount != null ? Number(order.subtotalAmount) : null;
    const couponCode = order && order.couponCode ? String(order.couponCode) : null;
    if (discount <= 0 || subtotal === null) return;

    // Fix the "Discount" row: show the real amount and tag it with the
    // coupon code (once — guard so we don't keep re-prepending on re-runs).
    // IMPORTANT: match on ownText (direct text-node children only), never
    // el.textContent — otherwise a big wrapper div whose full descendant
    // text happens to start with "Discount"/"Sub Total" would also match,
    // and overwriting its textContent would wipe out all its child rows.
    const discountLabels = Array.from(document.querySelectorAll('div,span,td,th,p,strong,b'))
      .filter((el) => el.children.length === 0 && (ownText(el) === 'Discount' || /^Discount \(/.test(ownText(el))));

    discountLabels.forEach((label) => {
      const found = findRowAmountElement(label);
      if (!found || !found.amountEl) return;
      const { amountEl } = found;
      if (label.dataset.ppOrderKey === orderKey) return; // already patched for this order
      label.dataset.ppOrderKey = orderKey;
      if (couponCode) label.textContent = 'Discount (' + couponCode + ')';
      amountEl.textContent = '- ' + rupee(discount);
      amountEl.style.color = '#166534';
      amountEl.style.fontWeight = '600';
    });

    // Fix the "Sub Total" row: show the real pre-discount subtotal instead
    // of the already-discounted total the bundle currently renders there.
    const subLabels = Array.from(document.querySelectorAll('div,span,td,th,p,strong,b'))
      .filter((el) => el.children.length === 0 && /^Sub Total/i.test(ownText(el)));

    subLabels.forEach((label) => {
      if (label.dataset.ppOrderKey === orderKey) return; // already patched for this order
      const found = findRowAmountElement(label);
      if (!found || !found.amountEl) return;
      label.dataset.ppOrderKey = orderKey;
      found.amountEl.textContent = rupee(subtotal);
    });
  }

  async function ensureOrderDiscountPatch() {
    const target = await resolveOrderTarget();
    if (!target.key) return;
    try {
      const order = await fetchOrderMoney(target);
      if (order) patchDiscountRows(order, target.key);
    } catch (err) {
      console.warn('Failed to load order discount info:', err.message || err);
    }
  }

  let patchLoopBusy = false;
  setInterval(async () => {
    if (patchLoopBusy) return;
    patchLoopBusy = true;
    try {
      await ensureProductFormPatch();
      await ensureOrderDiscountPatch();
    } catch (err) {
      console.warn('Admin product-cost/order-summary patch error:', err.message || err);
    } finally {
      patchLoopBusy = false;
    }
  }, 1200);
})();
