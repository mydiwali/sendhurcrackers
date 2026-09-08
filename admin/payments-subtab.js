// Patches the compiled admin bundle (no React source ships in this repo) to add:
//  1) A working "Payments" tab in Order Detail (Item Details | Payments | Shipments | Invoices)
//  2) A payment-status filter dropdown in the "All Sales Orders" sidebar
(function () {
  'use strict';

  const API_BASE = '/api';
  const TAB_LABELS = ['Item Details', 'Shipments', 'Invoices'];

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

  function currency(n) {
    return 'Rs ' + Number(n || 0).toFixed(2);
  }

  function badgeClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'paid') return 'bg-green-100 text-green-700 border-green-200';
    if (s === 'partial payment') return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-red-100 text-red-700 border-red-200';
  }

  // ── 1) Order Detail: Payments tab ──────────────────────────────────────────

  function findTabNav() {
    const navs = Array.from(document.querySelectorAll('nav'));
    return navs.find((nav) => {
      const buttons = Array.from(nav.querySelectorAll('button')).map(text);
      return TAB_LABELS.every((label) => buttons.includes(label));
    }) || null;
  }

  function getMainAndGrid(nav) {
    const barWrapper = nav.parentElement; // div.border-b.mb-5
    if (!barWrapper) return null;
    const grid = barWrapper.nextElementSibling; // div.grid...
    if (!grid) return null;
    const main = grid.querySelector(':scope > div');
    if (!main) return null;
    return { grid, main };
  }

  function paymentRowHtml(p) {
    const created = p.createdAt && p.createdAt.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleString() : '-';
    return (
      '<tr data-payment-id="' + p.id + '" class="border-b border-gray-100">' +
        '<td class="px-3 py-2 text-xs text-gray-600">' + created + '</td>' +
        '<td class="px-3 py-2 text-sm font-medium">' + currency(p.amount) + '</td>' +
        '<td class="px-3 py-2 text-sm">' + (p.paymentMethod || '-') + '</td>' +
        '<td class="px-3 py-2 text-sm text-gray-600">' + (p.referenceNumber || '-') + '</td>' +
        '<td class="px-3 py-2 text-sm text-gray-600">' + (p.notes || '-') + '</td>' +
        '<td class="px-3 py-2 text-right">' +
          '<button class="pm-edit text-blue-600 text-xs font-medium mr-2" data-id="' + p.id + '">Edit</button>' +
          '<button class="pm-delete text-red-600 text-xs font-medium" data-id="' + p.id + '">Delete</button>' +
        '</td>' +
      '</tr>'
    );
  }

  function paymentsPanelHtml() {
    return (
      '<div id="pm-panel" class="lg:col-span-3 bg-white border border-gray-200 rounded-xl overflow-hidden" style="display:none">' +
        '<div class="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">' +
          '<h3 class="text-sm font-semibold text-gray-800">Payments</h3>' +
          '<span id="pm-status-badge" class="px-2.5 py-0.5 rounded-full text-xs font-semibold border"></span>' +
        '</div>' +
        '<div class="p-5">' +
          '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">' +
            '<div class="p-3 rounded-lg border border-gray-200"><div class="text-xs text-gray-500">Order Total</div><div id="pm-total" class="font-semibold text-gray-900"></div></div>' +
            '<div class="p-3 rounded-lg border border-gray-200"><div class="text-xs text-gray-500">Collected</div><div id="pm-collected" class="font-semibold text-green-600"></div></div>' +
            '<div class="p-3 rounded-lg border border-gray-200"><div class="text-xs text-gray-500">Balance Due</div><div id="pm-balance" class="font-semibold text-red-600"></div></div>' +
          '</div>' +
          '<form id="pm-form" class="grid grid-cols-1 md:grid-cols-5 gap-2 mb-5">' +
            '<input id="pm-amount" type="number" step="0.01" min="0.01" placeholder="Amount" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" required />' +
            '<select id="pm-method" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" required>' +
              '<option value="">Method</option>' +
              '<option value="Cash">Cash</option>' +
              '<option value="Bank Transfer">Bank Transfer</option>' +
              '<option value="Check">Check</option>' +
              '<option value="Online">Online</option>' +
              '<option value="Other">Other</option>' +
            '</select>' +
            '<input id="pm-ref" type="text" placeholder="Reference" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />' +
            '<input id="pm-notes" type="text" placeholder="Notes" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />' +
            '<button id="pm-submit" type="submit" class="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium">Add Payment</button>' +
          '</form>' +
          '<div class="overflow-x-auto">' +
            '<table class="w-full text-sm">' +
              '<thead class="bg-gray-50 text-gray-500 text-xs"><tr>' +
                '<th class="px-3 py-2 text-left font-medium">Date</th>' +
                '<th class="px-3 py-2 text-left font-medium">Amount</th>' +
                '<th class="px-3 py-2 text-left font-medium">Method</th>' +
                '<th class="px-3 py-2 text-left font-medium">Reference</th>' +
                '<th class="px-3 py-2 text-left font-medium">Notes</th>' +
                '<th class="px-3 py-2 text-right font-medium">Actions</th>' +
              '</tr></thead>' +
              '<tbody id="pm-tbody"></tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  let currentOrderId = '';
  let editPaymentId = '';
  let paymentsTabActive = false;

  function extractOrderId() {
    const m = location.pathname.match(/\/orders\/([0-9a-fA-F-]{20,})/);
    return m ? m[1] : '';
  }

  async function refreshPaymentsPanel(orderId) {
    const panel = document.getElementById('pm-panel');
    if (!panel) return;
    const summary = await api('/admin/orders/' + orderId + '/payments', { method: 'GET' });
    const data = summary.data || {};

    document.getElementById('pm-total').textContent = currency(data.orderTotal || 0);
    document.getElementById('pm-collected').textContent = currency(data.amountCollected || 0);
    document.getElementById('pm-balance').textContent = currency(data.balanceDue || 0);
    const badge = document.getElementById('pm-status-badge');
    badge.textContent = data.paymentStatus || 'Unpaid';
    badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-semibold border ' + badgeClass(data.paymentStatus);

    const payments = Array.isArray(data.payments) ? data.payments : [];
    const tbody = document.getElementById('pm-tbody');
    tbody.innerHTML = payments.length
      ? payments.map(paymentRowHtml).join('')
      : '<tr><td colspan="6" class="px-3 py-4 text-center text-gray-400 text-sm">No payments recorded yet</td></tr>';

    tbody.onclick = async function (e) {
      const target = e.target;
      const id = target && target.getAttribute ? target.getAttribute('data-id') : null;
      if (!id) return;

      if (target.classList.contains('pm-delete')) {
        if (!confirm('Delete this payment?')) return;
        try {
          await api('/admin/orders/' + orderId + '/payments/' + id, { method: 'DELETE' });
          await refreshPaymentsPanel(orderId);
        } catch (err) {
          alert(err.message || 'Delete failed');
        }
        return;
      }

      if (target.classList.contains('pm-edit')) {
        const row = payments.find((p) => p.id === id);
        if (!row) return;
        editPaymentId = id;
        document.getElementById('pm-amount').value = String(row.amount || '');
        document.getElementById('pm-method').value = row.paymentMethod || '';
        document.getElementById('pm-ref').value = row.referenceNumber || '';
        document.getElementById('pm-notes').value = row.notes || '';
        document.getElementById('pm-submit').textContent = 'Update Payment';
      }
    };
  }

  function bindPaymentForm(orderId) {
    const form = document.getElementById('pm-form');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const amountEl = document.getElementById('pm-amount');
      const methodEl = document.getElementById('pm-method');
      const refEl = document.getElementById('pm-ref');
      const notesEl = document.getElementById('pm-notes');
      const submitBtn = document.getElementById('pm-submit');

      const body = {
        amount: Number(amountEl.value),
        paymentMethod: methodEl.value,
        referenceNumber: refEl.value || null,
        notes: notesEl.value || null,
      };
      if (!body.amount || body.amount <= 0 || !body.paymentMethod) {
        alert('Please enter amount and payment method');
        return;
      }

      submitBtn.disabled = true;
      try {
        if (editPaymentId) {
          await api('/admin/orders/' + orderId + '/payments/' + editPaymentId, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await api('/admin/orders/' + orderId + '/payments', { method: 'POST', body: JSON.stringify(body) });
        }
        amountEl.value = ''; methodEl.value = ''; refEl.value = ''; notesEl.value = '';
        editPaymentId = '';
        submitBtn.textContent = 'Add Payment';
        await refreshPaymentsPanel(orderId);
      } catch (err) {
        alert(err.message || 'Payment save failed');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function setActiveVisual(activeBtn, allTabButtons) {
    allTabButtons.forEach((btn) => {
      const isActive = btn === activeBtn;
      btn.classList.toggle('border-blue-600', isActive);
      btn.classList.toggle('text-blue-600', isActive);
      btn.classList.toggle('border-transparent', !isActive);
      btn.classList.toggle('text-gray-500', !isActive);
    });
  }

  function showPayments(nav, main) {
    const paymentsBtn = Array.from(nav.querySelectorAll('button')).find((b) => text(b) === 'Payments');
    const realTabs = Array.from(nav.querySelectorAll('button')).filter((b) => TAB_LABELS.includes(text(b)));
    if (paymentsBtn) setActiveVisual(paymentsBtn, realTabs.concat(paymentsBtn));

    main.style.display = 'none';
    const panel = document.getElementById('pm-panel');
    if (panel) panel.style.display = '';
    paymentsTabActive = true;

    if (currentOrderId) {
      bindPaymentForm(currentOrderId);
      refreshPaymentsPanel(currentOrderId).catch((err) => console.warn('Payments load failed:', err.message || err));
    }
  }

  function hidePayments(main) {
    main.style.display = '';
    const panel = document.getElementById('pm-panel');
    if (panel) panel.style.display = 'none';
    paymentsTabActive = false;
  }

  function ensureOrderDetailPatch() {
    const nav = findTabNav();
    if (!nav) return;

    const hostInfo = getMainAndGrid(nav);
    if (!hostInfo) return;
    const { main } = hostInfo;

    const orderId = extractOrderId();
    if (orderId !== currentOrderId) {
      currentOrderId = orderId;
      editPaymentId = '';
      const oldPanel = document.getElementById('pm-panel');
      if (oldPanel) oldPanel.remove();
      hidePayments(main);
    }

    if (!document.getElementById('pm-panel')) {
      main.insertAdjacentHTML('afterend', paymentsPanelHtml());
    }

    let paymentsBtn = Array.from(nav.querySelectorAll('button')).find((b) => text(b) === 'Payments');
    if (!paymentsBtn) {
      const shipmentsBtn = Array.from(nav.querySelectorAll('button')).find((b) => text(b) === 'Shipments');
      if (!shipmentsBtn) return;
      paymentsBtn = shipmentsBtn.cloneNode(true);
      paymentsBtn.textContent = 'Payments';
      shipmentsBtn.parentElement.insertBefore(paymentsBtn, shipmentsBtn);
    }

    if (paymentsBtn.dataset.pmBound !== '1') {
      paymentsBtn.dataset.pmBound = '1';
      paymentsBtn.addEventListener('click', () => showPayments(nav, main));
    }

    // Restore normal tab behavior when a real tab is clicked while Payments is active
    if (!nav.dataset.pmCaptureBound) {
      nav.dataset.pmCaptureBound = '1';
      nav.addEventListener('click', (e) => {
        const label = text(e.target);
        if (TAB_LABELS.includes(label) && paymentsTabActive) {
          hidePayments(main);
        }
      }, true);
    }
  }

  // ── 2) Orders sidebar: payment-status filter ────────────────────────────────

  function findOrdersStatusSelect() {
    const selects = Array.from(document.querySelectorAll('select'));
    return selects.find((sel) => {
      const opts = Array.from(sel.options).map(text);
      if (opts[0] !== 'All Status') return false;
      const section = sel.closest('div');
      return section && section.querySelector('input[placeholder="Search orders..."]');
    }) || null;
  }

  function findOrdersListContainer(statusSelect) {
    const sidebarSection = statusSelect.closest('div'); // p-3 border-b wrapper
    const sidebar = sidebarSection ? sidebarSection.parentElement : null; // w-72 wrapper
    return sidebar ? sidebar.querySelector(':scope > .flex-1.overflow-y-auto') : null;
  }

  function orderRowHtml(o) {
    const name = (o.shippingAddress && o.shippingAddress.fullName) || o.guestName || o.email || 'Guest';
    const totalAmt = o.totalAmount || o.total || 0;
    const created = o.createdAt && o.createdAt.seconds ? new Date(o.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const payStatus = o.paymentStatus || 'Unpaid';
    return (
      '<div data-order-id="' + o.id + '" class="pm-order-row px-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<p class="text-xs font-bold text-gray-800 truncate">' + name + '</p>' +
          '<p class="text-xs font-bold text-gray-900 shrink-0 ml-2">Rs ' + Number(totalAmt).toLocaleString() + '</p>' +
        '</div>' +
        '<div class="flex items-center justify-between">' +
          '<p class="text-[11px] text-gray-400 font-mono">' + (o.orderNumber || '') + '</p>' +
          '<p class="text-[11px] text-gray-400">' + created + '</p>' +
        '</div>' +
        '<div class="mt-1"><span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ' + badgeClass(payStatus) + '">' + payStatus + '</span></div>' +
      '</div>'
    );
  }

  function navigateToOrder(id) {
    window.history.pushState({}, '', '/orders/' + id);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  async function applyPaymentFilter(statusSelect, paymentSelect) {
    const listContainer = findOrdersListContainer(statusSelect);
    if (!listContainer) return;

    const params = new URLSearchParams({ size: '200' });
    if (statusSelect.value) params.set('status', statusSelect.value);
    if (paymentSelect.value) params.set('paymentStatus', paymentSelect.value);

    try {
      const res = await api('/admin/orders?' + params.toString(), { method: 'GET' });
      const content = ((res || {}).data || {}).content || [];
      listContainer.innerHTML = content.length
        ? content.map(orderRowHtml).join('')
        : '<div class="p-6 text-center text-sm text-gray-400">No orders found</div>';

      listContainer.querySelectorAll('.pm-order-row').forEach((row) => {
        row.addEventListener('click', () => navigateToOrder(row.getAttribute('data-order-id')));
      });
    } catch (err) {
      console.warn('Payment filter load failed:', err.message || err);
    }
  }

  function ensureOrdersFilterPatch() {
    const statusSelect = findOrdersStatusSelect();
    if (!statusSelect) return;
    if (document.getElementById('pm-payment-filter')) return;

    const paymentSelect = document.createElement('select');
    paymentSelect.id = 'pm-payment-filter';
    paymentSelect.className = statusSelect.className + ' mt-2';
    paymentSelect.innerHTML =
      '<option value="">All Payments</option>' +
      '<option value="paid">Paid</option>' +
      '<option value="partial payment">Partial Payment</option>' +
      '<option value="unpaid">Unpaid</option>';

    statusSelect.insertAdjacentElement('afterend', paymentSelect);
    paymentSelect.addEventListener('change', () => applyPaymentFilter(statusSelect, paymentSelect));
  }

  let patchLoopBusy = false;
  setInterval(() => {
    if (patchLoopBusy) return;
    patchLoopBusy = true;
    try {
      ensureOrderDetailPatch();
      ensureOrdersFilterPatch();
    } catch (err) {
      console.warn('Admin payments patch error:', err.message || err);
    } finally {
      patchLoopBusy = false;
    }
  }, 1200);
})();
