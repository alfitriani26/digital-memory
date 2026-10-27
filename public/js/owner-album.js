// Halaman kelola album untuk pemilik acara:
// foto, permintaan akses, pesan, template, QR, dan pengaturan.

const albumId = new URLSearchParams(location.search).get('id');
const API = '/api/albums/' + albumId;

const state = { album: null, me: null, photos: [], requests: [], messages: [], templates: [], limit: 1, themeKeys: [], filter: 'all' };

const THEMES = {
  floral: { label: 'Floral', icon: '🌸', bg: 'linear-gradient(135deg,#f8d7df,#fdf3f5)' },
  y2k: { label: 'Y2K', icon: '✨', bg: 'linear-gradient(135deg,#c9b6ff,#8ff0ff)' },
  cream: { label: 'Krem', icon: '🤍', bg: 'linear-gradient(135deg,#f6ead7,#fffaf0)' },
  elegant: { label: 'Elegan', icon: '🖤', bg: 'linear-gradient(135deg,#2b2430,#6b5a3c)' },
};
const themeLabel = (key) => (THEMES[key] ? THEMES[key].label : key);

// ---------- tab ----------
function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  ['photos', 'requests', 'messages', 'templates', 'settings'].forEach((n) => $('#panel-' + n).classList.toggle('hidden', n !== name));
  history.replaceState(null, '', '#' + name);
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

function updateCounts() {
  $('#c-photos').textContent = state.photos.length;
  const pending = state.requests.filter((r) => r.status === 'pending').length;
  $('#c-requests').textContent = pending;
  $('#c-requests').style.display = pending ? '' : 'none';
  $('#c-messages').textContent = state.messages.length;
  $('#c-templates').textContent = `${state.templates.length}/${state.limit}`;
}

// ---------- header ----------
function renderHeader() {
  const a = state.album;
  document.title = a.title + ' · Digital Memory';
  setAccent(a.theme_color);
  $('#title').textContent = a.title;
  $('#subtitle').textContent = (a.event_date ? formatDate(a.event_date) + ' · ' : '') + 'Kode ' + a.code;
  const open = a.upload_open;
  const badge = $('#status-badge');
  badge.textContent = open ? 'Unggahan tamu dibuka' : 'Unggahan ditutup';
  badge.className = 'badge ' + (open ? 'badge-public' : 'badge-warn');
  $('#guest-link').href = '/a/' + a.code;
}

// ---------- foto ----------
function renderPhotos() {
  const box = $('#panel-photos');
  const list = state.photos.filter((p) => state.filter === 'all' || p.visibility === state.filter);
  const nPrivate = state.photos.filter((p) => p.visibility === 'private').length;

  box.innerHTML = `
    <div class="row-between">
      <div class="row">
        <button class="chip ${state.filter === 'all' ? 'active' : ''}" data-f="all">Semua (${state.photos.length})</button>
        <button class="chip ${state.filter === 'public' ? 'active' : ''}" data-f="public">Publik (${state.photos.length - nPrivate})</button>
        <button class="chip ${state.filter === 'private' ? 'active' : ''}" data-f="private">Privat (${nPrivate})</button>
      </div>
    </div>
    <div class="alert alert-info small">Sebagai pemilik acara, kamu bisa melihat semua foto dengan jelas, termasuk yang ditandai privat oleh tamu.</div>
    <div class="photo-grid" id="grid"></div>`;

  $$('[data-f]', box).forEach((b) =>
    b.addEventListener('click', () => {
      state.filter = b.dataset.f;
      renderPhotos();
    })
  );

  const grid = $('#grid', box);
  if (!list.length) {
    grid.outerHTML = '<div class="empty">Belum ada foto di sini. Bagikan QR album supaya tamu mulai mengunggah.</div>';
    return;
  }
  list.forEach((p) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'photo';
    tile.innerHTML =
      (p.media_type === 'video'
        ? '<div style="width:100%;height:100%;background:#2b2430;color:#fff;display:flex;align-items:center;justify-content:center;font-size:2rem">▶</div><span class="play">Video</span>'
        : `<img loading="lazy" src="${esc(p.thumb_url)}" alt="Foto dari ${esc(p.guest_name)}" />`) +
      `<span class="tag badge ${p.visibility === 'private' ? 'badge-private' : 'badge-public'}">${p.visibility === 'private' ? 'Privat' : 'Publik'}</span>` +
      `<span class="by">${esc(p.guest_name)}</span>`;
    tile.addEventListener('click', () => openPhoto(p));
    grid.appendChild(tile);
  });
}

function openPhoto(p) {
  const media =
    p.media_type === 'video'
      ? `<video class="lightbox-img" src="${esc(p.view_url)}" controls playsinline></video>`
      : `<img class="lightbox-img" src="${esc(p.view_url)}" alt="" />`;
  const m = openModal(`
    <div class="stack">
      ${media}
      <div class="row">
        <span class="badge ${p.visibility === 'private' ? 'badge-private' : 'badge-public'}">${p.visibility === 'private' ? 'Privat' : 'Publik'}</span>
        ${p.allow_template ? '<span class="badge">Boleh dipakai template</span>' : ''}
        <span class="small muted">Diunggah ${esc(p.guest_name)} · ${esc(timeAgo(p.created_at))}</span>
      </div>
      <div class="row">
        <a class="btn btn-primary grow" href="${esc(p.download_url)}">Unduh asli</a>
        <button class="btn btn-danger" type="button" data-del>Hapus</button>
      </div>
    </div>`);
  $('[data-del]', m.box).addEventListener('click', async () => {
    if (!confirm('Hapus foto ini dari album? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await api(`${API}/photos/${p.id}`, { method: 'DELETE' });
      m.close();
      toast('Foto dihapus.');
      await Promise.all([loadPhotos(), loadMessages(), loadRequests()]);
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// ---------- permintaan akses ----------
function renderRequests() {
  const box = $('#panel-requests');
  const pending = state.requests.filter((r) => r.status === 'pending');
  const statusBadge = { pending: ['badge-warn', 'Menunggu'], approved: ['badge-public', 'Disetujui'], rejected: ['', 'Ditolak'] };

  box.innerHTML = `
    <div class="alert alert-info small">Tamu yang meminta akses akan bisa <b>melihat</b> foto privat itu. Mereka tidak bisa mengunduhnya atau memakainya di template.</div>
    ${
      pending.length
        ? `<div class="row"><button class="btn btn-primary btn-sm" data-bulk="approve">Setujui semua (${pending.length})</button>
           <button class="btn btn-sm" data-bulk="reject">Tolak semua</button></div>`
        : ''
    }
    <div class="list" id="req-list"></div>`;

  const list = $('#req-list', box);
  if (!state.requests.length) {
    list.outerHTML = '<div class="empty">Belum ada permintaan akses.</div>';
  }
  state.requests.forEach((r) => {
    const [cls, label] = statusBadge[r.status];
    const item = document.createElement('div');
    item.className = 'list-item';
    const buttons =
      r.status === 'pending'
        ? '<button class="btn btn-primary btn-sm" data-act="approve">Setujui</button><button class="btn btn-sm" data-act="reject">Tolak</button>'
        : r.status === 'approved'
        ? '<button class="btn btn-sm" data-act="reject">Cabut akses</button>'
        : '<button class="btn btn-sm" data-act="approve">Setujui</button>';
    item.innerHTML = `
      ${r.thumb_url ? `<img src="${esc(r.thumb_url)}" alt="" />` : '<div style="width:56px;height:56px;border-radius:8px;background:#2b2430;flex:none"></div>'}
      <div class="grow">
        <div><b>${esc(r.guest_name)}</b> meminta akses ke foto <b>${esc(r.uploader_name)}</b></div>
        <div class="small muted">${esc(timeAgo(r.created_at))} · <span class="badge ${cls}">${label}</span></div>
      </div>
      <div class="row">${buttons}</div>`;
    $$('[data-act]', item).forEach((b) => b.addEventListener('click', () => decide(r.id, b.dataset.act)));
    list.appendChild(item);
  });
  $$('[data-bulk]', box).forEach((b) => b.addEventListener('click', () => bulk(b.dataset.bulk, pending.length)));
}

async function decide(id, action) {
  try {
    await api(`${API}/requests/${id}`, { method: 'POST', json: { action } });
    await loadRequests();
    toast(action === 'approve' ? 'Akses disetujui.' : 'Akses ditolak.');
  } catch (e) {
    toast(e.message, true);
  }
}

async function bulk(action, n) {
  if (!confirm(`${action === 'approve' ? 'Setujui' : 'Tolak'} ${n} permintaan sekaligus?`)) return;
  try {
    await api(`${API}/requests/bulk`, { method: 'POST', json: { action } });
    await loadRequests();
    toast(action === 'approve' ? 'Semua permintaan disetujui.' : 'Semua permintaan ditolak.');
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------- pesan ----------
function renderMessages() {
  const box = $('#panel-messages');
  box.innerHTML = '<div class="alert alert-info small">Pesan dan kesan selalu publik, bahkan kalau foto yang menyertainya privat.</div><div class="list" id="msg-list"></div>';
  const list = $('#msg-list', box);
  if (!state.messages.length) {
    list.outerHTML = '<div class="empty">Belum ada pesan dari tamu.</div>';
    return;
  }
  state.messages.forEach((m) => {
    const el = document.createElement('div');
    el.className = 'message';
    el.innerHTML = `
      ${m.photo_thumb_url ? `<img class="thumb" src="${esc(m.photo_thumb_url)}" alt="" />` : ''}
      <div class="grow">
        <div class="who">${esc(m.guest_name)} <span class="small muted">· ${esc(timeAgo(m.created_at))}</span></div>
        ${m.text ? `<div>${esc(m.text)}</div>` : ''}
        ${m.audio_url ? `<audio controls preload="none" src="${esc(m.audio_url)}"></audio>` : ''}
      </div>
      <button class="btn btn-sm btn-danger" type="button">Hapus</button>`;
    $('button', el).addEventListener('click', async () => {
      if (!confirm('Hapus pesan ini?')) return;
      try {
        await api(`${API}/messages/${m.id}`, { method: 'DELETE' });
        await loadMessages();
        toast('Pesan dihapus.');
      } catch (e) {
        toast(e.message, true);
      }
    });
    list.appendChild(el);
  });
}

// ---------- template ----------
function templatePreview(t) {
  if (t.kind === 'image') return `<img src="${esc(t.image_url)}" alt="" />`;
  const th = THEMES[t.theme_key] || { icon: '🎨', bg: '#eee' };
  return `<div style="aspect-ratio:4/5;background:${th.bg};display:flex;align-items:center;justify-content:center;font-size:2rem">${th.icon}</div>`;
}

function renderTemplates() {
  const box = $('#panel-templates');
  const full = state.templates.length >= state.limit;
  const planName = state.me ? state.me.planInfo.label : '';

  box.innerHTML = `
    <div class="alert alert-info small">Template adalah bingkai atau latar yang dipilih tamu saat membuat kolase foto. Paket ${esc(planName)} boleh membuat <b>${state.limit}</b> template untuk album ini (terpakai ${state.templates.length}).</div>
    <div class="tpl-grid" id="tpl-grid"></div>
    <div class="card card-pad stack" id="tpl-form-box"></div>`;

  const grid = $('#tpl-grid', box);
  if (!state.templates.length) grid.outerHTML = '<div class="empty">Belum ada template. Tamu tetap bisa membuat kolase polos.</div>';
  state.templates.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'tpl';
    el.style.cursor = 'default';
    el.innerHTML = `${templatePreview(t)}<span>${esc(t.name)}</span><div style="padding:0 6px 8px"><button class="btn btn-sm btn-danger btn-block" type="button">Hapus</button></div>`;
    $('button', el).addEventListener('click', async () => {
      if (!confirm(`Hapus template "${t.name}"?`)) return;
      try {
        await api(`${API}/templates/${t.id}`, { method: 'DELETE' });
        await loadTemplates();
        toast('Template dihapus.');
      } catch (e) {
        toast(e.message, true);
      }
    });
    $('#tpl-grid', box) && $('#tpl-grid', box).appendChild(el);
  });

  const formBox = $('#tpl-form-box', box);
  if (full) {
    formBox.innerHTML = `<b>Batas template sudah tercapai.</b>
      <span class="muted small">${state.me && state.me.plan === 'basic' ? 'Ganti ke paket Premium untuk membuat sampai 5 template.' : 'Hapus salah satu template untuk menambah yang baru.'}</span>
      ${state.me && state.me.plan === 'basic' ? '<a class="btn btn-primary" href="/owner/dashboard.html">Lihat paket</a>' : ''}`;
    return;
  }
  formBox.innerHTML = `
    <h3>Tambah template</h3>
    <form class="stack" novalidate>
      <div class="field"><label for="t-name">Nama template</label><input id="t-name" type="text" maxlength="40" placeholder="Contoh: Pink Floral" /></div>
      <div class="field"><label>Jenis</label>
        <div class="segmented">
          <label><input type="radio" name="kind" value="theme" checked /><span>Tema bawaan</span></label>
          <label><input type="radio" name="kind" value="image" /><span>Gambar sendiri</span></label>
        </div>
      </div>
      <div class="field" id="t-theme-box"><label for="t-theme">Pilih tema</label>
        <select id="t-theme">${state.themeKeys.map((k) => `<option value="${esc(k)}">${esc(themeLabel(k))}</option>`).join('')}</select>
      </div>
      <div class="field hidden" id="t-image-box"><label for="t-image">Gambar latar</label>
        <input id="t-image" type="file" accept="image/*" />
        <span class="hint">Disarankan rasio potret 4:5 (misalnya 1080 × 1350). Maksimal 8 MB.</span>
      </div>
      <div class="field"><label for="t-caption">Tulisan di bawah kolase (opsional)</label><input id="t-caption" type="text" maxlength="80" placeholder="Contoh: Raka &amp; Sinta · 21 Oktober 2026" /></div>
      <button class="btn btn-primary" type="submit">Simpan template</button>
    </form>`;

  const form = $('form', formBox);
  const sync = () => {
    const kind = form.elements.kind.value;
    $('#t-theme-box', form).classList.toggle('hidden', kind !== 'theme');
    $('#t-image-box', form).classList.toggle('hidden', kind !== 'image');
  };
  $$('input[name=kind]', form).forEach((r) => r.addEventListener('change', sync));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = form.elements.kind.value;
    const name = $('#t-name', form).value.trim();
    if (!name) return toast('Nama template wajib diisi.', true);
    const fd = new FormData();
    fd.append('name', name);
    fd.append('kind', kind);
    fd.append('caption', $('#t-caption', form).value);
    if (kind === 'theme') fd.append('theme_key', $('#t-theme', form).value);
    else {
      const file = $('#t-image', form).files[0];
      if (!file) return toast('Pilih gambar latar dulu.', true);
      fd.append('image', file);
    }
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      await api(`${API}/templates`, { method: 'POST', body: fd });
      await loadTemplates();
      toast('Template tersimpan.');
    } catch (err) {
      toast(err.message, true);
      button.disabled = false;
    }
  });
}

// ---------- QR dan pengaturan ----------
function renderSettings() {
  const a = state.album;
  const box = $('#panel-settings');
  box.innerHTML = `
    <div class="row" style="align-items:stretch">
      <div class="qr-box" style="flex:1 1 280px">
        <h3>QR untuk tamu</h3>
        <img src="${API}/qr.png?t=${Date.now()}" alt="Kode QR album" />
        <div class="url-box mt">${esc(a.guest_url)}</div>
        <div class="row mt" style="justify-content:center">
          <a class="btn btn-primary btn-sm" href="${API}/qr.png?download=1">Unduh QR</a>
          <button class="btn btn-sm" type="button" id="copy-url">Salin link</button>
        </div>
        <p class="hint mt">Cetak QR ini di undangan, tiket, atau tampilkan di layar proyektor supaya tamu bisa scan sebelum dan selama acara.</p>
      </div>

      <div class="card card-pad stack" style="flex:1 1 280px">
        <h3>Waktu unggah tamu</h3>
        <div class="alert ${a.upload_open ? 'alert-ok' : 'alert-error'}">
          ${a.upload_open ? 'Dibuka sampai <b>' + esc(formatDateTime(a.upload_until)) + '</b>' : 'Saat ini <b>ditutup</b>. Tamu hanya bisa melihat.'}
        </div>
        <div class="field">
          <label for="w-days">Buka unggahan sampai berapa hari dari sekarang?</label>
          <div class="row"><input id="w-days" type="number" min="1" max="365" value="3" style="max-width:100px" /><button class="btn btn-primary btn-sm" type="button" id="w-open">Perbarui</button></div>
        </div>
        <button class="btn btn-sm" type="button" id="w-close" ${a.upload_open ? '' : 'disabled'}>Tutup unggahan sekarang</button>
        <p class="hint">Setelah ditutup, tamu tidak bisa lagi mengunggah foto atau mengirim pesan. Kamu sebagai pemilik tetap bisa.</p>
      </div>
    </div>

    <div class="card card-pad">
      <h3>Informasi album</h3>
      <form class="stack" id="edit-form" novalidate>
        <div class="field"><label for="e-title">Nama acara</label><input id="e-title" type="text" maxlength="100" value="${esc(a.title)}" /></div>
        <div class="field"><label for="e-date">Tanggal acara</label><input id="e-date" type="date" value="${esc(a.event_date || '')}" /></div>
        <div class="field"><label for="e-desc">Sapaan untuk tamu</label><textarea id="e-desc" maxlength="300">${esc(a.description || '')}</textarea></div>
        <div class="field"><label for="e-color">Warna tema</label><input id="e-color" type="color" value="${esc(a.theme_color)}" /></div>
        <label class="check"><input id="e-private" type="checkbox" ${a.default_private ? 'checked' : ''} /><span>Foto baru <b>privat</b> secara bawaan</span></label>
        <button class="btn btn-primary" type="submit">Simpan perubahan</button>
      </form>
    </div>

    <div class="card card-pad stack">
      <h3>Hapus album</h3>
      <p class="muted small">Semua foto, video, pesan, dan template di album ini akan dihapus permanen.</p>
      <div><button class="btn btn-danger" type="button" id="del-album">Hapus album ini</button></div>
    </div>`;

  $('#copy-url', box).addEventListener('click', () => copyText(a.guest_url));

  $('#w-open', box).addEventListener('click', () => patchAlbum({ upload_days_from_now: Number($('#w-days', box).value) || 1 }, 'Waktu unggah diperbarui.'));
  $('#w-close', box).addEventListener('click', () => {
    if (confirm('Tutup unggahan untuk tamu sekarang?')) patchAlbum({ upload_days_from_now: 0 }, 'Unggahan ditutup.');
  });

  $('#edit-form', box).addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#e-title', box).value.trim();
    if (!title) return toast('Nama acara wajib diisi.', true);
    patchAlbum(
      {
        title,
        event_date: $('#e-date', box).value,
        description: $('#e-desc', box).value,
        theme_color: $('#e-color', box).value,
        default_private: $('#e-private', box).checked,
      },
      'Perubahan disimpan.'
    );
  });

  $('#del-album', box).addEventListener('click', async () => {
    if (!confirm(`Hapus album "${a.title}" beserta semua isinya? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api(API, { method: 'DELETE' });
      location.href = '/owner/dashboard.html';
    } catch (e) {
      toast(e.message, true);
    }
  });
}

async function patchAlbum(changes, message) {
  try {
    const updated = await api(API, { method: 'PATCH', json: changes });
    state.album = { ...state.album, ...updated };
    renderHeader();
    renderSettings();
    toast(message);
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------- memuat data ----------
async function loadPhotos() { state.photos = await api(`${API}/photos`); renderPhotos(); updateCounts(); }
async function loadRequests() { state.requests = await api(`${API}/requests`); renderRequests(); updateCounts(); }
async function loadMessages() { state.messages = await api(`${API}/messages`); renderMessages(); updateCounts(); }
async function loadTemplates() {
  const data = await api(`${API}/templates`);
  state.templates = data.templates;
  state.limit = data.limit;
  state.themeKeys = data.themeKeys;
  renderTemplates();
  updateCounts();
}

(async function init() {
  if (!albumId) return (location.href = '/owner/dashboard.html');
  state.me = await requireLogin();
  try {
    state.album = await api(API);
  } catch (e) {
    document.querySelector('main').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div><a class="btn" href="/owner/dashboard.html">Kembali ke dashboard</a>`;
    return;
  }
  renderHeader();
  renderSettings();
  try {
    await Promise.all([loadPhotos(), loadRequests(), loadMessages(), loadTemplates()]);
  } catch (e) {
    toast(e.message, true);
  }
  const wanted = location.hash.replace('#', '');
  if (['photos', 'requests', 'messages', 'templates', 'settings'].includes(wanted)) showTab(wanted);
})();