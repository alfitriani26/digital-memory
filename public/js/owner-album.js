// Halaman kelola album untuk pemilik acara:
// foto, permintaan akses, pesan, template, QR, dan pengaturan.

const albumId = new URLSearchParams(location.search).get('id');
const API = '/api/albums/' + albumId;

const state = { album: null, me: null, photos: [], requests: [], messages: [], templates: [], limit: 1, themeKeys: [], filter: 'all' };

const themeLabel = (key) => (THEMES[key] ? THEMES[key].name : key);

function renderThemeThumb(key) {
  const c = document.createElement('canvas');
  c.width = 216;
  c.height = 270;
  c.style.cssText = 'width:100%;aspect-ratio:4/5;display:block';
  const ctx = c.getContext('2d');
  ctx.scale(0.2, 0.2);
  if (THEMES[key]) THEMES[key].draw(ctx);
  return c;
}

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
const TPL_PRESETS = {
  '1': [{ x: 0.08, y: 0.08, w: 0.84, h: 0.75 }],
  '2v': [{ x: 0.08, y: 0.08, w: 0.84, h: 0.36 }, { x: 0.08, y: 0.46, w: 0.84, h: 0.36 }],
  '2h': [{ x: 0.08, y: 0.14, w: 0.41, h: 0.62 }, { x: 0.51, y: 0.14, w: 0.41, h: 0.62 }],
  '3a': [{ x: 0.08, y: 0.08, w: 0.84, h: 0.42 }, { x: 0.08, y: 0.52, w: 0.41, h: 0.31 }, { x: 0.51, y: 0.52, w: 0.41, h: 0.31 }],
  '4g': [{ x: 0.08, y: 0.08, w: 0.41, h: 0.36 }, { x: 0.51, y: 0.08, w: 0.41, h: 0.36 }, { x: 0.08, y: 0.46, w: 0.41, h: 0.36 }, { x: 0.51, y: 0.46, w: 0.41, h: 0.36 }],
};

// Mendeteksi kotak-kotak slot foto:
// 1) Lubang transparan (PNG alpha < 40) -> overlay = true
// 2) Kotak solid/datar (JPG/PNG non-transparan, misal kotak putih/abu/gelap) -> overlay = false
function detectTemplateSlots(img) {
  const W = 270;
  const H = 338;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const { data } = ctx.getImageData(0, 0, W, H);
  const queue = new Int32Array(W * H);

  function collectRegions(isSeed, canJoin, minRect = 0.65) {
    const seen = new Uint8Array(W * H);
    const regions = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const start = y * W + x;
        if (seen[start] || !isSeed(start)) continue;
        let head = 0, tail = 0;
        queue[tail++] = start;
        seen[start] = 1;
        let minX = x, maxX = x, minY = y, maxY = y;
        const sr = data[start * 4], sg = data[start * 4 + 1], sb = data[start * 4 + 2];
        while (head < tail) {
          const idx = queue[head++];
          const cx = idx % W;
          const cy = (idx - cx) / W;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (cx > 0 && !seen[idx - 1] && canJoin(idx - 1, sr, sg, sb)) { seen[idx - 1] = 1; queue[tail++] = idx - 1; }
          if (cx + 1 < W && !seen[idx + 1] && canJoin(idx + 1, sr, sg, sb)) { seen[idx + 1] = 1; queue[tail++] = idx + 1; }
          if (cy > 0 && !seen[idx - W] && canJoin(idx - W, sr, sg, sb)) { seen[idx - W] = 1; queue[tail++] = idx - W; }
          if (cy + 1 < H && !seen[idx + W] && canJoin(idx + W, sr, sg, sb)) { seen[idx + W] = 1; queue[tail++] = idx + W; }
        }
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const w = bw / W;
        const h = bh / H;
        const rectRatio = tail / (bw * bh);
        const touchesAllSides = (minX <= 1 && maxX >= W - 2) || (minY <= 1 && maxY >= H - 2);
        if (w >= 0.08 && h >= 0.08 && w * h <= 0.85 && !touchesAllSides && tail >= W * H * 0.01 && rectRatio >= minRect) {
          regions.push({
            x: Math.round((minX / W) * 1000) / 1000,
            y: Math.round((minY / H) * 1000) / 1000,
            w: Math.round(w * 1000) / 1000,
            h: Math.round(h * 1000) / 1000,
            area: tail,
          });
        }
      }
    }
    regions.sort((a, b) => b.area - a.area);
    const picked = regions.slice(0, 6).sort((a, b) => (Math.abs(a.y - b.y) > 0.08 ? a.y - b.y : a.x - b.x));
    return picked.map(({ x, y, w, h }) => ({ x, y, w, h }));
  }

  // Pass 1: lubang transparan (PNG)
  const alphaSlots = collectRegions(
    (i) => data[i * 4 + 3] < 40,
    (i) => data[i * 4 + 3] < 40,
    0.55
  );
  if (alphaSlots.length) return { slots: alphaSlots, overlay: true };

  // Pass 2: kotak datar/solid (putih, abu, hitam, atau warna seragam di dalam frame)
  const isFlat = (i) => {
    const x = i % W, y = (i - x) / W;
    if (x <= 1 || x >= W - 2 || y <= 1 || y >= H - 2) return false;
    const p = i * 4, r = (i + 1) * 4, d = (i + W) * 4;
    const gx = Math.abs(data[p] - data[r]) + Math.abs(data[p + 1] - data[r + 1]) + Math.abs(data[p + 2] - data[r + 2]);
    const gy = Math.abs(data[p] - data[d]) + Math.abs(data[p + 1] - data[d + 1]) + Math.abs(data[p + 2] - data[d + 2]);
    return gx + gy < 20;
  };
  const solidSlots = collectRegions(
    (i) => isFlat(i),
    (i, sr, sg, sb) => {
      const p = i * 4;
      return isFlat(i) && Math.abs(data[p] - sr) + Math.abs(data[p + 1] - sg) + Math.abs(data[p + 2] - sb) < 30;
    },
    0.72
  );
  return { slots: solidSlots, overlay: false };
}

function templatePreview(t) {
  if (t.kind === 'image') return `<img src="${esc(t.image_url)}" alt="" />`;
  return `<div class="tpl-thumb-slot" data-theme-thumb="${esc(t.theme_key)}"></div>`;
}

function renderTemplates(editing = null) {
  const box = $('#panel-templates');
  const full = state.templates.length >= state.limit;
  const planName = state.me ? state.me.planInfo.label : '';
  const isEdit = Boolean(editing);

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
    el.innerHTML = `${templatePreview(t)}<span>${esc(t.name)}</span>
      <div class="row" style="padding:0 6px 8px;gap:6px">
        <button class="btn btn-sm grow" type="button" data-edit>Edit</button>
        <button class="btn btn-sm btn-danger grow" type="button" data-del>Hapus</button>
      </div>`;
    $('[data-edit]', el).addEventListener('click', () => {
      renderTemplates(t);
      $('#tpl-form-box', box).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('[data-del]', el).addEventListener('click', async () => {
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
    const thumbSlot = $('[data-theme-thumb]', el);
    if (thumbSlot) thumbSlot.replaceWith(renderThemeThumb(t.theme_key));
  });

  const formBox = $('#tpl-form-box', box);
  if (full && !isEdit) {
    formBox.innerHTML = `<b>Batas template sudah tercapai.</b>
      <span class="muted small">${state.me && state.me.plan === 'basic' ? 'Ganti ke paket Premium untuk membuat sampai 5 template.' : 'Edit atau hapus salah satu template untuk mengganti.'}</span>
      ${state.me && state.me.plan === 'basic' ? '<a class="btn btn-primary" href="/owner/dashboard.html">Lihat paket</a>' : ''}`;
    return;
  }

  const cfg = editing && editing.layout_config ? editing.layout_config : null;
  const editor = {
    slots: (cfg && Array.isArray(cfg.slots) && cfg.slots.length ? cfg.slots : TPL_PRESETS['1']).map((s) => ({ ...s })),
    frame: cfg && cfg.frame ? { ...cfg.frame } : { color: '#ffffff', border: 12, radius: 14, shadow: true },
    overlay: Boolean(cfg && cfg.overlay),
    active: 0,
    url: null,
  };

  formBox.innerHTML = `
    <div class="row-between">
      <h3>${isEdit ? `Edit template: ${esc(editing.name)}` : 'Tambah template'}</h3>
      ${isEdit ? '<button class="btn btn-sm" type="button" id="t-cancel-edit">Batal edit</button>' : ''}
    </div>
    <form class="stack" novalidate>
      <div class="field"><label for="t-name">Nama template</label><input id="t-name" type="text" maxlength="40" placeholder="Contoh: Pink Floral" value="${esc(editing ? editing.name : '')}" /></div>
      <div class="field"><label>Jenis</label>
        <div class="segmented">
          <label><input type="radio" name="kind" value="theme" ${!editing || editing.kind === 'theme' ? 'checked' : ''} /><span>Tema bawaan</span></label>
          <label><input type="radio" name="kind" value="image" ${editing && editing.kind === 'image' ? 'checked' : ''} /><span>Gambar sendiri</span></label>
        </div>
      </div>
      <div class="field" id="t-theme-box"><label>Pilih tema</label>
        <input id="t-theme" type="hidden" value="${esc(editing && editing.theme_key ? editing.theme_key : state.themeKeys[0] || 'floral')}" />
        <div class="tpl-grid" id="t-theme-picker"></div>
      </div>
      <div class="field hidden" id="t-image-box"><label for="t-image">${isEdit && editing.kind === 'image' ? 'Ganti gambar (opsional)' : 'Gambar latar / frame'}</label>
        <input id="t-image" type="file" accept="image/*" />
        <span class="hint">Disarankan rasio potret 4:5 (misalnya 1080 × 1350). PNG berlubang transparan akan otomatis terdeteksi slotnya.</span>
        <div class="tpl-editor-grid hidden" id="t-slot-editor" style="margin-top:10px">
          <div class="stack" style="gap:6px">
            <div class="tpl-stage" id="t-editor-stage">
              <img id="t-editor-bg" alt="" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none" />
              <div id="t-editor-slots" style="position:absolute;inset:0"></div>
            </div>
            <span class="hint" style="text-align:center">Seret kotak untuk geser · Seret ↘ untuk ubah ukuran</span>
          </div>
          <div class="tpl-controls">
            <div class="tpl-panel">
              <div class="row-between">
                <b>Posisi &amp; jumlah slot</b>
                <button class="btn btn-sm" type="button" id="t-auto-detect">✨ Deteksi otomatis</button>
              </div>
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm" type="button" data-preset="1">1 foto</button>
                <button class="btn btn-sm" type="button" data-preset="2v">2 atas-bawah</button>
                <button class="btn btn-sm" type="button" data-preset="2h">2 kiri-kanan</button>
                <button class="btn btn-sm" type="button" data-preset="3a">3 foto</button>
                <button class="btn btn-sm" type="button" data-preset="4g">4 grid</button>
              </div>
              <div class="row" style="gap:6px">
                <button class="btn btn-sm grow" type="button" id="t-add-slot">+ Slot</button>
                <button class="btn btn-sm btn-danger grow" type="button" id="t-del-slot">Hapus slot</button>
              </div>
              <div class="small muted" id="t-slot-info"></div>
            </div>
            <div class="tpl-panel">
              <b>Gaya bingkai &amp; lapisan</b>
              <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
                <label class="small" style="display:flex;align-items:center;gap:6px">Warna <input id="t-frame-color" type="color" value="${esc(editor.frame.color)}" style="width:34px;height:28px;padding:0;border:none;background:none;cursor:pointer" /></label>
                <label class="small" style="display:flex;align-items:center;gap:6px">Tebal <input id="t-frame-border" type="range" min="0" max="30" value="${editor.frame.border}" style="width:84px" /><span id="t-val-border">${editor.frame.border}px</span></label>
                <label class="small" style="display:flex;align-items:center;gap:6px">Sudut <input id="t-frame-radius" type="range" min="0" max="60" value="${editor.frame.radius}" style="width:84px" /><span id="t-val-radius">${editor.frame.radius}px</span></label>
              </div>
              <label class="small" style="display:flex;align-items:center;gap:6px"><input id="t-frame-shadow" type="checkbox" ${editor.frame.shadow ? 'checked' : ''} /> Bayangan</label>
              <label class="small" style="display:flex;align-items:center;gap:6px"><input id="t-frame-overlay" type="checkbox" ${editor.overlay ? 'checked' : ''} /> Frame di atas foto (PNG transparan)</label>
            </div>
          </div>
        </div>
      </div>
      <div class="field"><label for="t-caption">Tulisan di bawah kolase (opsional)</label><input id="t-caption" type="text" maxlength="80" placeholder="Contoh: Raka &amp; Sinta · 21 Oktober 2026" value="${esc(editing && editing.caption ? editing.caption : '')}" /></div>
      <button class="btn btn-primary" type="submit">${isEdit ? 'Simpan perubahan' : 'Simpan template'}</button>
    </form>`;

  if (isEdit) {
    $('#t-cancel-edit', formBox).addEventListener('click', () => renderTemplates(null));
  }

  const form = $('form', formBox);
  const bgEl = $('#t-editor-bg', form);

  const themeInput = $('#t-theme', form);
  const themePicker = $('#t-theme-picker', form);
  state.themeKeys.forEach((k) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tpl' + (k === themeInput.value ? ' active' : '');
    btn.appendChild(renderThemeThumb(k));
    const span = document.createElement('span');
    span.textContent = themeLabel(k);
    btn.appendChild(span);
    btn.addEventListener('click', () => {
      themeInput.value = k;
      $$('.tpl', themePicker).forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
    });
    themePicker.appendChild(btn);
  });

  function drawSlotEditor() {
    const wrap = $('#t-editor-slots', form);
    const stage = $('#t-editor-stage', form);
    if (!wrap || !stage) return;
    const scale = (stage.clientWidth || 340) / 1080;
    const b = Math.round(editor.frame.border * scale);
    const r = Math.round(editor.frame.radius * scale);
    wrap.innerHTML = '';
    editor.slots.forEach((s, i) => {
      const boxEl = document.createElement('div');
      const isActive = i === editor.active;
      boxEl.style.cssText = `position:absolute;left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;height:${s.h * 100}%;box-sizing:border-box;border:${Math.max(2, b)}px solid ${editor.frame.color};border-radius:${r}px;background:rgba(255,255,255,0.28);cursor:move;display:flex;align-items:center;justify-content:center;${editor.frame.shadow ? 'box-shadow:0 4px 12px rgba(0,0,0,0.25);' : ''}${isActive ? 'outline:2px dashed #e11d48;outline-offset:2px;' : ''}`;
      boxEl.innerHTML = `<span style="background:rgba(0,0,0,0.68);color:#fff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;pointer-events:none">Foto ${i + 1}</span>
        <div data-resize="${i}" style="position:absolute;right:-4px;bottom:-4px;width:20px;height:20px;background:#e11d48;color:#fff;border-radius:5px;font-size:12px;line-height:20px;text-align:center;cursor:nwse-resize">↘</div>`;
      boxEl.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        editor.active = i;
        const rect = stage.getBoundingClientRect();
        const resizing = ev.target && ev.target.dataset && ev.target.dataset.resize !== undefined;
        const startX = ev.clientX, startY = ev.clientY;
        const orig = { ...s };
        drawSlotEditor();
        const onMove = (mv) => {
          const dx = (mv.clientX - startX) / rect.width;
          const dy = (mv.clientY - startY) / rect.height;
          if (resizing) {
            editor.slots[i].w = Math.max(0.08, Math.min(1 - orig.x, orig.w + dx));
            editor.slots[i].h = Math.max(0.08, Math.min(1 - orig.y, orig.h + dy));
          } else {
            editor.slots[i].x = Math.max(0, Math.min(1 - orig.w, orig.x + dx));
            editor.slots[i].y = Math.max(0, Math.min(1 - orig.h, orig.y + dy));
          }
          drawSlotEditor();
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
      wrap.appendChild(boxEl);
    });
    const cur = editor.slots[editor.active];
    $('#t-slot-info', form).textContent = cur
      ? `Slot ${editor.active + 1} aktif: posisi (${Math.round(cur.x * 100)}%, ${Math.round(cur.y * 100)}%) · ukuran ${Math.round(cur.w * 100)}% × ${Math.round(cur.h * 100)}%`
      : '';
    $('#t-del-slot', form).disabled = editor.slots.length <= 1;
    $('#t-add-slot', form).disabled = editor.slots.length >= 6;
  }

  function runAutoDetect(silent) {
    if (!bgEl.complete || !bgEl.naturalWidth) return;
    try {
      const { slots: found, overlay } = detectTemplateSlots(bgEl);
      if (found.length) {
        editor.slots = found;
        editor.active = 0;
        editor.overlay = overlay;
        $('#t-frame-overlay', form).checked = overlay;
        drawSlotEditor();
        toast(`Terdeteksi ${found.length} slot kotak! Anda tetap bisa menggeser atau mengeditnya.`);
      } else if (!silent) {
        toast('Tidak ditemukan kotak otomatis. Silakan atur slot secara manual atau pilih preset.', true);
      }
    } catch {
      if (!silent) toast('Gagal mendeteksi kotak pada gambar.', true);
    }
  }

  $('#t-image', form).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (editor.url) { URL.revokeObjectURL(editor.url); editor.url = null; }
    if (!file) return;
    editor.url = URL.createObjectURL(file);
    bgEl.onload = () => {
      $('#t-slot-editor', form).classList.remove('hidden');
      requestAnimationFrame(() => {
        drawSlotEditor();
        runAutoDetect(true);
      });
    };
    bgEl.src = editor.url;
  });

  if (isEdit && editing.kind === 'image' && editing.image_url) {
    bgEl.onload = () => {
      $('#t-slot-editor', form).classList.remove('hidden');
      requestAnimationFrame(drawSlotEditor);
    };
    bgEl.src = editing.image_url;
  }

  $('#t-auto-detect', form).addEventListener('click', () => runAutoDetect(false));
  $$('[data-preset]', form).forEach((btn) => btn.addEventListener('click', () => {
    editor.slots = (TPL_PRESETS[btn.dataset.preset] || TPL_PRESETS['1']).map((s) => ({ ...s }));
    editor.active = 0;
    drawSlotEditor();
  }));
  $('#t-add-slot', form).addEventListener('click', () => {
    if (editor.slots.length >= 6) return;
    const n = editor.slots.length;
    editor.slots.push({ x: Math.min(0.6, 0.1 + n * 0.06), y: Math.min(0.6, 0.1 + n * 0.06), w: 0.35, h: 0.3 });
    editor.active = n;
    drawSlotEditor();
  });
  $('#t-del-slot', form).addEventListener('click', () => {
    if (editor.slots.length <= 1) return;
    editor.slots.splice(editor.active, 1);
    editor.active = Math.max(0, editor.active - 1);
    drawSlotEditor();
  });
  $('#t-frame-color', form).addEventListener('input', (e) => { editor.frame.color = e.target.value; drawSlotEditor(); });
  $('#t-frame-border', form).addEventListener('input', (e) => {
    editor.frame.border = Number(e.target.value);
    $('#t-val-border', form).textContent = `${editor.frame.border}px`;
    drawSlotEditor();
  });
  $('#t-frame-radius', form).addEventListener('input', (e) => {
    editor.frame.radius = Number(e.target.value);
    $('#t-val-radius', form).textContent = `${editor.frame.radius}px`;
    drawSlotEditor();
  });
  $('#t-frame-shadow', form).addEventListener('change', (e) => { editor.frame.shadow = e.target.checked; drawSlotEditor(); });
  $('#t-frame-overlay', form).addEventListener('change', (e) => { editor.overlay = e.target.checked; });

  const sync = () => {
    const kind = form.elements.kind.value;
    $('#t-theme-box', form).classList.toggle('hidden', kind !== 'theme');
    $('#t-image-box', form).classList.toggle('hidden', kind !== 'image');
  };
  $$('input[name=kind]', form).forEach((r) => r.addEventListener('change', sync));
  sync();

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
      if (!file && (!isEdit || editing.kind !== 'image')) return toast('Pilih gambar latar dulu.', true);
      if (file) fd.append('image', file);
      fd.append('layout_config', JSON.stringify({ slots: editor.slots, frame: editor.frame, overlay: editor.overlay }));
    }
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const url = isEdit ? `${API}/templates/${editing.id}` : `${API}/templates`;
      await api(url, { method: isEdit ? 'PUT' : 'POST', body: fd });
      if (editor.url) URL.revokeObjectURL(editor.url);
      await loadTemplates();
      toast(isEdit ? 'Template diperbarui.' : 'Template tersimpan.');
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