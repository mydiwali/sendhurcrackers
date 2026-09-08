// Patches the compiled admin bundle (no React source ships in this repo) to add:
//  1) A "Purchased Price" (cost) field on the Add/Edit Product form — internal only,
//     never returned by the customer-facing API and never shown on the storefront.
//  2) A "Full Summary (PDF)" button on Order Detail that exports S.No, Product Name,
//     Qty, Actual Price and Purchased Price for every line item.
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

  function currency(n) {
    return 'Rs ' + Number(n || 0).toFixed(2);
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

  // The compiled admin bundle's own axios instance has the production API
  // origin hardcoded (https://mydiwalicrackers.com/api), so when this app is
  // run locally (e.g. `php -S localhost:8000`) every built-in page (orders
  // list, order detail, products list, etc.) still fetches its data from
  // production while this local DB is empty/different — causing "Order not
  // found" and similar errors purely as a local-testing artifact. When we
  // detect we're running on a local dev host, rewrite those requests to the
  // current origin instead. This never runs in production (hostname check),
  // so it changes no existing behavior there.
  const IS_LOCAL_DEV = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname);
  const PROD_API_RE = /^https?:\/\/(www\.)?mydiwalicrackers\.com\/api/i;

  // Admin product save requests go through axios (XHR transport), so we splice
  // purchasedPrice into the outgoing JSON body right before it is sent.
  const OrigOpen = XMLHttpRequest.prototype.open;
  const OrigSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    let finalUrl = url;
    try {
      if (IS_LOCAL_DEV && typeof url === 'string' && PROD_API_RE.test(url)) {
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

  let jsPdfLoadPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function ensureJsPdfLoaded() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (!jsPdfLoadPromise) {
      jsPdfLoadPromise = loadScript('https://cdn.jsdelivr.net/npm/jspdf@2/dist/jspdf.umd.min.js')
        .then(() => loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3/dist/jspdf.plugin.autotable.min.js'));
    }
    return jsPdfLoadPromise;
  }

  async function downloadOrderSummaryPdf(target, btn) {
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing...';
    try {
      await ensureJsPdfLoaded();
      const orderPath = target.by === 'id'
        ? '/admin/orders/' + target.value
        : '/orders/' + encodeURIComponent(target.value);
      const [orderRes, productsRes] = await Promise.all([
        api(orderPath, { method: 'GET' }),
        api('/admin/products', { method: 'GET' }),
      ]);
      const order = orderRes.data || {};
      const items = Array.isArray(order.items) ? order.items : [];
      const products = Array.isArray(productsRes.data) ? productsRes.data : [];
      const costById = {};
      products.forEach((p) => { costById[p.id] = p.purchasedPrice; });

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(13);
      doc.text('Order Summary' + (order.orderNumber ? ' - ' + order.orderNumber : ''), 14, 15);

      let grandTotalPrice = 0;
      let grandTotalPurchasedPrice = 0;
      const rows = items.map((item, idx) => {
        const cost = item.productId != null ? costById[item.productId] : null;
        const qty = Number(item.quantity || 0);
        const actualPrice = Number(item.price || 0);
        const purchasedPrice = cost !== null && cost !== undefined ? Number(cost) : null;
        const totalPrice = actualPrice * qty;
        const totalPurchasedPrice = purchasedPrice !== null ? purchasedPrice * qty : null;

        grandTotalPrice += totalPrice;
        if (totalPurchasedPrice !== null) grandTotalPurchasedPrice += totalPurchasedPrice;

        return [
          String(idx + 1),
          item.name || '-',
          String(qty),
          currency(actualPrice),
          purchasedPrice !== null ? currency(purchasedPrice) : '-',
          currency(totalPrice),
          totalPurchasedPrice !== null ? currency(totalPurchasedPrice) : '-',
        ];
      });

      doc.autoTable({
        startY: 22,
        head: [['S.No', 'Product Name', 'Qty', 'Actual Price', 'Purchased Price', 'Total Price', 'Total Purchased Price']],
        body: rows,
        foot: [[
          '',
          'Grand Total',
          '',
          '',
          '',
          currency(grandTotalPrice),
          currency(grandTotalPurchasedPrice),
        ]],
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
        styles: { fontSize: 9 },
      });

      doc.save('order-summary-' + (order.orderNumber || target.key || 'order') + '.pdf');
    } catch (err) {
      alert(err.message || 'Failed to generate summary PDF');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  function findPrimaryOrderDownloadButton() {
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => text(b) === 'Download PDF');
    if (!buttons.length) return null;

    // Prefer the order action-row button (the one next to "Preview Bill"),
    // not the invoice modal button.
    for (let i = 0; i < buttons.length; i += 1) {
      const b = buttons[i];
      const row = b.parentElement;
      if (!row) continue;
      const hasPreview = Array.from(row.querySelectorAll('button')).some((x) => text(x) === 'Preview Bill');
      if (hasPreview) return b;
    }
    return buttons[0];
  }

  async function ensureOrderSummaryButton() {
    const target = await resolveOrderTarget();

    let wrap = document.getElementById('pp-summary-btn-wrap');
    if (!target.key) {
      if (wrap) wrap.remove();
      return;
    }
    const downloadBtn = findPrimaryOrderDownloadButton();
    if (!downloadBtn) {
      if (wrap) wrap.remove();
      return;
    }

    const parentRow = downloadBtn.parentElement;
    if (!parentRow) return;

    if (wrap && wrap.dataset.orderKey === target.key && document.body.contains(wrap) && wrap.parentElement === parentRow) return;
    if (wrap) wrap.remove();

    wrap = document.createElement('span');
    wrap.id = 'pp-summary-btn-wrap';
    wrap.dataset.orderKey = target.key;
    wrap.style.display = 'inline-flex';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Order Full Summary PDF';
    btn.className = downloadBtn.className || 'px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium';
    btn.addEventListener('click', () => downloadOrderSummaryPdf(target, btn));

    wrap.appendChild(btn);
    downloadBtn.insertAdjacentElement('afterend', wrap);
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
      await ensureOrderSummaryButton();
      await ensureOrderDiscountPatch();
    } catch (err) {
      console.warn('Admin product-cost/order-summary patch error:', err.message || err);
    } finally {
      patchLoopBusy = false;
    }
  }, 1200);
})();
