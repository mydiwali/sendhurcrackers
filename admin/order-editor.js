// Patches the compiled admin bundle (no React source ships in this repo) to add
// an "Edit Order" button on Order Detail that lets admin add/remove line items
// (with product search), change quantities, and apply/remove a coupon code.
(function () {
  'use strict';

  const API_BASE = '/api';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
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

  function extractPathOrderId() {
    const m = location.pathname.match(/\/orders\/([0-9a-fA-F-]{20,})/);
    return m ? m[1] : '';
  }

  // Cached product catalog for the "add product" search box.
  let productsCache = null;
  let productsCacheAt = 0;
  const PRODUCTS_CACHE_MS = 60 * 1000;
  async function loadProducts() {
    const now = Date.now();
    if (productsCache && now - productsCacheAt < PRODUCTS_CACHE_MS) return productsCache;
    const res = await api('/admin/products', { method: 'GET' });
    productsCache = Array.isArray(res.data) ? res.data : [];
    productsCacheAt = now;
    return productsCache;
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  let modalState = null; // { orderId, items: [{productId,name,price,quantity,image}], couponCode }

  function closeModal() {
    const el = document.getElementById('oe-modal-overlay');
    if (el) el.remove();
    modalState = null;
  }

  function renderItemsRows() {
    const body = document.getElementById('oe-items-body');
    if (!body || !modalState) return;
    body.innerHTML = modalState.items.map((it, idx) => (
      '<tr>' +
        '<td style="padding:6px 8px;">' + (it.name || '-') + '</td>' +
        '<td style="padding:6px 8px;text-align:right;">' + rupee(it.price) + '</td>' +
        '<td style="padding:6px 8px;text-align:center;">' +
          '<input type="number" min="1" value="' + it.quantity + '" data-idx="' + idx + '" class="oe-qty-input" style="width:56px;text-align:center;border:1px solid #d1d5db;border-radius:6px;padding:2px 4px;" />' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:right;">' + rupee(it.price * it.quantity) + '</td>' +
        '<td style="padding:6px 8px;text-align:center;"><button type="button" data-idx="' + idx + '" class="oe-remove-btn" style="color:#dc2626;border:none;background:none;cursor:pointer;font-weight:600;">Remove</button></td>' +
      '</tr>'
    )).join('') || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#9ca3af;">No items</td></tr>';

    body.querySelectorAll('.oe-qty-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.idx);
        const q = Math.max(1, parseInt(inp.value, 10) || 1);
        modalState.items[idx].quantity = q;
        renderItemsRows();
        renderSummary();
      });
    });
    body.querySelectorAll('.oe-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        modalState.items.splice(idx, 1);
        renderItemsRows();
        renderSummary();
      });
    });
  }

  function renderSummary() {
    const el = document.getElementById('oe-subtotal');
    if (!el || !modalState) return;
    const subtotal = modalState.items.reduce((s, it) => s + it.price * it.quantity, 0);
    el.textContent = rupee(subtotal);
  }

  function addOrIncrementItem(product) {
    const existing = modalState.items.find((it) => it.productId === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      modalState.items.push({
        productId: product.id,
        name: product.name,
        price: Number(product.price || 0),
        quantity: 1,
        image: product.primaryImageUrl || '',
      });
    }
    renderItemsRows();
    renderSummary();
  }

  async function handleSearchInput(inputEl, resultsEl) {
    const q = inputEl.value.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; return; }
    let products;
    try {
      products = await loadProducts();
    } catch (err) {
      resultsEl.innerHTML = '<div style="padding:8px;color:#dc2626;">Failed to load products</div>';
      resultsEl.style.display = 'block';
      return;
    }
    const matches = products.filter((p) => (p.name || '').toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) {
      resultsEl.innerHTML = '<div style="padding:8px;color:#9ca3af;">No matching products</div>';
      resultsEl.style.display = 'block';
      return;
    }
    resultsEl.innerHTML = matches.map((p) => (
      '<div class="oe-search-result" data-id="' + p.id + '" style="padding:8px;cursor:pointer;display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;">' +
        '<span>' + (p.name || '-') + '</span><span style="color:#6b7280;">' + rupee(p.price) + '</span>' +
      '</div>'
    )).join('');
    resultsEl.style.display = 'block';
    resultsEl.querySelectorAll('.oe-search-result').forEach((row) => {
      row.addEventListener('click', () => {
        const product = matches.find((p) => p.id === row.dataset.id);
        if (product) addOrIncrementItem(product);
        inputEl.value = '';
        resultsEl.innerHTML = '';
        resultsEl.style.display = 'none';
      });
    });
  }

  async function handleSave(saveBtn, errEl) {
    errEl.textContent = '';
    saveBtn.disabled = true;
    const originalLabel = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    try {
      const couponInput = document.getElementById('oe-coupon-input');
      const couponCode = couponInput ? couponInput.value.trim() : '';
      const payload = {
        items: modalState.items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
        couponCode: couponCode || null,
      };
      await api('/admin/orders/' + modalState.orderId + '/items', { method: 'PUT', body: JSON.stringify(payload) });
      closeModal();
      location.reload();
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save order';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  }

  async function openEditModal(orderId) {
    if (document.getElementById('oe-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'oe-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:12px;max-width:640px;width:100%;max-height:85vh;overflow:auto;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,0.2);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<h2 style="font-size:18px;font-weight:600;margin:0;">Edit Order</h2>' +
          '<button type="button" id="oe-close-btn" style="border:none;background:none;font-size:20px;cursor:pointer;color:#6b7280;">&times;</button>' +
        '</div>' +
        '<div style="position:relative;margin-bottom:12px;">' +
          '<label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">Add Product</label>' +
          '<input id="oe-search-input" type="text" placeholder="Search products by name..." style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;box-sizing:border-box;" />' +
          '<div id="oe-search-results" style="display:none;position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid #d1d5db;border-radius:8px;margin-top:4px;max-height:200px;overflow:auto;z-index:1;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:12px;">' +
          '<thead><tr style="text-align:left;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">' +
            '<th style="padding:6px 8px;">Product</th><th style="padding:6px 8px;text-align:right;">Price</th>' +
            '<th style="padding:6px 8px;text-align:center;">Qty</th><th style="padding:6px 8px;text-align:right;">Total</th><th></th>' +
          '</tr></thead>' +
          '<tbody id="oe-items-body"></tbody>' +
        '</table>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<div><label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;">Coupon Code</label>' +
            '<input id="oe-coupon-input" type="text" placeholder="e.g. DIWALI10" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;" /></div>' +
          '<div style="text-align:right;"><div style="font-size:12px;color:#6b7280;">Subtotal</div><div id="oe-subtotal" style="font-size:18px;font-weight:600;">\u20B90.00</div></div>' +
        '</div>' +
        '<p style="font-size:12px;color:#9ca3af;margin:0 0 12px;">Discount and final total are recalculated automatically from the coupon after saving.</p>' +
        '<div id="oe-error" style="color:#dc2626;font-size:13px;margin-bottom:8px;"></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
          '<button type="button" id="oe-cancel-btn" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;">Cancel</button>' +
          '<button type="button" id="oe-save-btn" style="padding:8px 16px;border:none;border-radius:8px;background:#111827;color:#fff;cursor:pointer;font-weight:500;">Save Changes</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('oe-close-btn').addEventListener('click', closeModal);
    document.getElementById('oe-cancel-btn').addEventListener('click', closeModal);

    const searchInput = document.getElementById('oe-search-input');
    const searchResults = document.getElementById('oe-search-results');
    searchInput.addEventListener('input', () => handleSearchInput(searchInput, searchResults));
    document.addEventListener('click', function outsideClick(e) {
      if (!document.getElementById('oe-modal-overlay')) { document.removeEventListener('click', outsideClick); return; }
      if (e.target !== searchInput) { searchResults.style.display = 'none'; }
    });

    document.getElementById('oe-save-btn').addEventListener('click', () => {
      handleSave(document.getElementById('oe-save-btn'), document.getElementById('oe-error'));
    });

    // Load current order into the modal
    try {
      const res = await api('/admin/orders/' + orderId, { method: 'GET' });
      const order = res.data || {};
      const items = Array.isArray(order.items) ? order.items : [];
      modalState = {
        orderId,
        items: items.map((it) => ({
          productId: it.productId || null,
          name: it.name || '',
          price: Number(it.price || 0),
          quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
          image: it.image || '',
        })),
        couponCode: order.couponCode || '',
      };
      document.getElementById('oe-coupon-input').value = modalState.couponCode || '';
      renderItemsRows();
      renderSummary();
    } catch (err) {
      document.getElementById('oe-error').textContent = err.message || 'Failed to load order';
    }
  }

  // ── Inject the "Edit Order" button on Order Detail ─────────────────────────

  function findActionButtonRow() {
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => /Download PDF|Preview Bill/i.test(text(b)));
    for (let i = 0; i < buttons.length; i += 1) {
      if (buttons[i].parentElement) return buttons[i].parentElement;
    }
    return null;
  }

  async function ensureEditButton() {
    const orderId = extractPathOrderId();
    let wrap = document.getElementById('oe-edit-btn-wrap');
    if (!orderId) {
      if (wrap) wrap.remove();
      return;
    }
    if (wrap && wrap.dataset.orderId === orderId && document.body.contains(wrap)) return;

    const row = findActionButtonRow();
    if (!row) return;
    if (wrap) wrap.remove();

    wrap = document.createElement('span');
    wrap.id = 'oe-edit-btn-wrap';
    wrap.dataset.orderId = orderId;
    wrap.style.display = 'inline-flex';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Edit Order';
    btn.className = 'px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium';
    btn.addEventListener('click', () => openEditModal(orderId));

    wrap.appendChild(btn);
    row.insertAdjacentElement('afterbegin', wrap);
  }

  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await ensureEditButton();
    } catch (err) {
      console.warn('Order editor patch error:', err.message || err);
    } finally {
      busy = false;
    }
  }, 1200);
})();
