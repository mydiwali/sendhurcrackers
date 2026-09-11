// Patches the compiled admin bundle (no React source ships in this repo) to add
// a "Price List Download" control on Settings > Social Media. Lets the admin
// upload a PDF and toggle whether the storefront shows a "Download Price List"
// icon next to the Home / All Products / Categories / Contact links.
// Stored under its own settings key ('priceList'), saved independently via its
// own Save button, so it is never touched/overwritten by the built-in
// Organization/Social Media form save.
(function () {
  'use strict';

  const API_BASE = '/api';
  const CARD_ID = 'pl-price-list-card';

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
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API_BASE + path, Object.assign({}, options || {}, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && (data.error || data.message)) || 'Request failed');
    return data;
  }

  function findSocialCard() {
    const h2 = Array.from(document.querySelectorAll('h2')).find((h) => h.textContent.trim() === 'Social Media Links');
    return h2 ? h2.parentElement : null;
  }

  function buildCard() {
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 space-y-4';
    card.innerHTML =
      '<h2 class="font-semibold text-gray-900 dark:text-slate-100">Price List Download</h2>' +
      '<p class="text-sm text-gray-500 dark:text-slate-400">Shows a "Download Price List" icon next to the Home / All Products / Categories / Contact links on the storefront. Upload a PDF and enable it below.</p>' +
      '<label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-200">' +
        '<input type="checkbox" id="pl-enabled" class="w-4 h-4" /> Enable price list download link' +
      '</label>' +
      '<div>' +
        '<label class="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">Price List File URL</label>' +
        '<div class="flex gap-2">' +
          '<input type="text" id="pl-url" class="input flex-1" placeholder="https://.../price-list.pdf" />' +
          '<button type="button" id="pl-upload-btn" class="border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 whitespace-nowrap">Upload PDF</button>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-center gap-3">' +
        '<button type="button" id="pl-save-btn" class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Save</button>' +
        '<span id="pl-status" class="text-sm"></span>' +
      '</div>';
    return card;
  }

  let fileInput = null;
  function ensureFileInput(onFile) {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/pdf';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) onFile(file);
    });
    return fileInput;
  }

  function setStatus(message, isError) {
    const el = document.getElementById('pl-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#dc2626' : '#16a34a';
    if (message) setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 3000);
  }

  async function loadCurrent() {
    try {
      const res = await api('/admin/settings/price-list');
      const data = res.data || {};
      const enabledEl = document.getElementById('pl-enabled');
      const urlEl = document.getElementById('pl-url');
      if (enabledEl) enabledEl.checked = !!data.enabled;
      if (urlEl && !urlEl.dataset.dirty) urlEl.value = data.url || '';
    } catch (_) { /* ignore, keep defaults */ }
  }

  async function uploadFile(file) {
    if (file.size > 15 * 1024 * 1024) {
      alert('File exceeds 15MB limit');
      return;
    }
    try {
      const token = findToken();
      const form = new FormData();
      form.append('file', file);
      const headers = {};
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(API_BASE + '/upload/branding', { method: 'POST', body: form, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'Upload failed');
      const urlEl = document.getElementById('pl-url');
      if (urlEl) { urlEl.value = data.data.url; urlEl.dataset.dirty = '1'; }
      setStatus('Uploaded');
    } catch (err) {
      setStatus((err && err.message) || 'Upload failed', true);
    }
  }

  async function save() {
    const enabledEl = document.getElementById('pl-enabled');
    const urlEl = document.getElementById('pl-url');
    try {
      await api('/admin/settings/price-list', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: !!(enabledEl && enabledEl.checked),
          url: (urlEl && urlEl.value.trim()) || '',
        }),
      });
      setStatus('Saved');
    } catch (err) {
      setStatus((err && err.message) || 'Save failed', true);
    }
  }

  function patch() {
    if (document.getElementById(CARD_ID)) return;
    const socialCard = findSocialCard();
    if (!socialCard) return;

    const card = buildCard();
    socialCard.insertAdjacentElement('afterend', card);

    document.getElementById('pl-upload-btn').addEventListener('click', () => {
      ensureFileInput(uploadFile).click();
    });
    document.getElementById('pl-url').addEventListener('input', (e) => { e.target.dataset.dirty = '1'; });
    document.getElementById('pl-save-btn').addEventListener('click', save);

    loadCurrent();
  }

  // Admins keep clicking the page's own "Save Changes"/"Save" button instead of
  // this card's dedicated one, so piggyback on those clicks too (harmless no-op
  // if our card isn't on screen).
  let globalSaveHookWired = false;
  function wireGlobalSaveHook() {
    if (globalSaveHookWired) return;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.id === 'pl-save-btn') return;
      const text = btn.textContent.trim();
      if ((text === 'Save Changes' || text === 'Save') && document.getElementById(CARD_ID)) {
        setTimeout(save, 50);
      }
    }, true);
    globalSaveHookWired = true;
  }

  setInterval(patch, 1000);
  wireGlobalSaveHook();
  patch();
})();
