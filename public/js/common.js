// Fungsi bantu yang dipakai semua halaman (pemilik maupun tamu).
// Dipanggil dengan <script src="/js/common.js"></script> sebelum skrip halaman.

// ---------- pintasan DOM ----------
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

// Mengamankan teks dari pengguna sebelum dimasukkan ke innerHTML
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- komunikasi dengan server ----------
// api('/api/albums')                      -> GET
// api('/api/albums', { method:'POST', json:{...} })
// api('/api/a/KODE/photos', { method:'POST', body: formData })
// Kalau server menjawab error, fungsi ini melempar Error dengan pesan dari server.
async function api(url, options = {}) {
  const init = { method: options.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (options.json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.json);
  } else if (options.body) {
    init.body = options.body; // FormData: browser mengatur Content-Type sendiri
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new Error('Tidak bisa terhubung ke server. Cek koneksi internetmu.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* jawaban bukan JSON */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Terjadi kesalahan. Coba lagi.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Unggah dengan indikator kemajuan (fetch biasa tidak bisa menampilkan persen)
function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (e) {
        /* bukan JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new Error((data && data.error) || 'Unggahan gagal. Coba lagi.');
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('Tidak bisa terhubung ke server. Cek koneksi internetmu.'));
    xhr.send(formData);
  });
}

// ---------- notifikasi singkat ----------
let toastTimer;
function toast(message, isError = false) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3200);
}

// ---------- jendela pop-up ----------
// const m = openModal('<h3>Judul</h3>...', { wide: true });  lalu m.close() untuk menutup
function openModal(content, options = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal';
  const box = document.createElement('div');
  box.className = 'modal-box' + (options.wide ? ' wide' : '');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Tutup');
  closeBtn.textContent = '×';
  box.appendChild(closeBtn);

  const body = document.createElement('div');
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);
  box.appendChild(body);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);

  const onKey = (e) => e.key === 'Escape' && close();
  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (options.onClose) options.onClose();
  }
  closeBtn.onclick = close;
  backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  return { box: body, close };
}

// ---------- tanggal dan waktu ----------
// Database menyimpan waktu UTC, contoh "2026-10-21 09:30:00"
function parseDate(value) {
  if (!value) return null;
  const s = String(value);
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

function formatDate(value) {
  const d = parseDate(String(value).length === 10 ? value + 'T00:00:00' : value);
  if (!d) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(value) {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(value) {
  const d = parseDate(value);
  if (!d) return '';
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return 'baru saja';
  if (sec < 3600) return Math.floor(sec / 60) + ' menit lalu';
  if (sec < 86400) return Math.floor(sec / 3600) + ' jam lalu';
  if (sec < 86400 * 7) return Math.floor(sec / 86400) + ' hari lalu';
  return formatDate(d.toISOString());
}

// ---------- warna tema album ----------
function mixColor(hex, withHex, ratio) {
  const a = hex.replace('#', '').match(/.{2}/g).map((h) => parseInt(h, 16));
  const b = withHex.replace('#', '').match(/.{2}/g).map((h) => parseInt(h, 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * ratio).toString(16).padStart(2, '0')).join('');
}

// Mengganti warna utama halaman sesuai warna tema album
function setAccent(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
  const root = document.documentElement.style;
  root.setProperty('--accent', color);
  root.setProperty('--accent-dark', mixColor(color, '#000000', 0.22));
  root.setProperty('--accent-soft', mixColor(color, '#ffffff', 0.82));
}

// ---------- lain-lain ----------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Tersalin!');
}

// Untuk halaman pemilik: kalau belum login, kembali ke halaman login
async function requireLogin() {
  try {
    return await api('/api/auth/me');
  } catch (e) {
    location.href = '/owner/login.html';
    return new Promise(() => {}); // hentikan skrip halaman selagi pindah
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    location.href = '/';
  }
}

// Tombol sedang memproses: nonaktif sementara supaya tidak terklik dua kali
async function busy(button, task) {
  const label = button.textContent;
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}