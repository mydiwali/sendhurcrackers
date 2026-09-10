// Patches the compiled admin bundle (no React source ships in this repo) to make
// the "Store Logo" dropzone on Settings > Organization actually upload a file,
// instead of only accepting a manually-pasted image URL.
(function () {
  'use strict';

  const API_BASE = '/api';
  const PATCHED_ATTR = 'data-logo-upload-patched';

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

  // React controlled inputs ignore a plain `el.value = x` assignment, so the
  // value must go through the native setter and fire a real "input" event.
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc.set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findStoreLogoParts() {
    const label = Array.from(document.querySelectorAll('label')).find(
      (l) => l.textContent.trim() === 'Store Logo'
    );
    const row = label && label.nextElementSibling;
    if (!row) return null;
    const dashedBox = row.querySelector('div.border-dashed');
    const urlInput = row.querySelector('input.input[placeholder="https://..."]');
    if (!dashedBox || !urlInput) return null;
    return { dashedBox, urlInput };
  }

  let fileInput = null;
  function ensureFileInput(onFile) {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) onFile(file);
    });
    return fileInput;
  }

  function renderPreview(dashedBox, url) {
    if (!dashedBox.dataset.originalHtml) dashedBox.dataset.originalHtml = dashedBox.innerHTML;
    let img = dashedBox.querySelector('img[data-logo-preview]');
    if (!img) {
      img = document.createElement('img');
      img.setAttribute('data-logo-preview', '1');
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      dashedBox.innerHTML = '';
      dashedBox.appendChild(img);
    }
    if (img.src !== url) img.src = url;
  }

  function clearPreview(dashedBox) {
    if (dashedBox.querySelector('img[data-logo-preview]') && dashedBox.dataset.originalHtml) {
      dashedBox.innerHTML = dashedBox.dataset.originalHtml;
    }
  }

  let uploading = false;
  async function uploadLogo(file, urlInput, dashedBox) {
    if (uploading) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large — max 5MB');
      return;
    }
    uploading = true;
    dashedBox.style.opacity = '0.5';
    try {
      const token = findToken();
      const form = new FormData();
      form.append('file', file);
      const headers = {};
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(API_BASE + '/upload/branding', { method: 'POST', body: form, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'Upload failed');
      setNativeValue(urlInput, data.data.url);
      renderPreview(dashedBox, data.data.url);
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      uploading = false;
      dashedBox.style.opacity = '';
    }
  }

  function patch() {
    const parts = findStoreLogoParts();
    if (!parts) return;
    const { dashedBox, urlInput } = parts;

    if (!dashedBox.getAttribute(PATCHED_ATTR)) {
      dashedBox.setAttribute(PATCHED_ATTR, '1');
      dashedBox.style.cursor = 'pointer';
      dashedBox.title = 'Click to upload a logo image';
      const input = ensureFileInput((file) => uploadLogo(file, urlInput, dashedBox));
      dashedBox.addEventListener('click', () => input.click());
    }

    // Keep the preview in sync with the current URL (typed manually or uploaded).
    if (urlInput.value) {
      renderPreview(dashedBox, urlInput.value);
    } else {
      clearPreview(dashedBox);
    }
  }

  setInterval(patch, 1000);
  patch();
})();
