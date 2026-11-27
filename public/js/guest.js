// Halaman tamu (tanpa login): lihat album, unggah foto/video, kirim pesan, minta akses foto privat.
// Alamat halaman ini: /a/KODE

const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '').toUpperCase();
const API = '/api/a/' + encodeURIComponent(code);

const state = { info: null, photos: [], messages: [], tab: 'public' };

// Pilihan unggah yang diingat selama halaman terbuka (nama diingat juga di browser)
const prefs = { name: '', visibility: 'public', allow_template: true, text: '' };
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } },
};
prefs.name = store.get('dm_name');

const isOpen = () => state.info && (state.info.upload_open || state.info.is_owner);

// ---------- tampilan atas ----------
function renderHero() {
  const a = state.info;
  setAccent(a.theme_color);
  document.title = a.title + ' · Digital Memory';
  const status = a.upload_open
    ? `<span class="badge badge-public">Unggahan dibuka sampai ${esc(formatDateTime(a.upload_until))}</span>`
    : '<span class="badge badge-warn">Unggahan sudah ditutup. Kamu masih bisa melihat foto.</span>';
  $('#hero').style.borderTop = '6px solid var(--accent)';
  $('#hero').innerHTML = `
    <div class="small muted">${a.event_date ? esc(formatDate(a.event_date)) : 'Album acara'}</div>
    <h1 style="margin:4px 0 8px">${esc(a.title)}</h1>
    ${a.description ? `<p class="muted">${esc(a.description)}</p>` : ''}
    <div>${status}</div>
    ${a.is_owner ? '<div class="small muted mt">Kamu melihat halaman ini sebagai pemilik acara.</div>' : ''}`;
  $('#bottombar').classList.remove('hidden');
  $('#btn-upload').disabled = !isOpen();
  $('#btn-upload').textContent = isOpen() ? '📷 Unggah' : '🔒 Unggahan ditutup';
  const nb = $('#notices');
  if (nb) {
    const old = $('#closed-notice');
    if (!isOpen() && !old) {
      const el = document.createElement('div');
      el.id = 'closed-notice';
      el.className = 'status-banner closed';
      el.innerHTML = '<span>⏰</span><span><b>Unggahan ditutup.</b> Waktu mengunggah untuk album ini sudah berakhir, tapi kamu masih bisa melihat foto dan membaca pesan.</span>';
      nb.prepend(el);
    } else if (isOpen() && old) old.remove();
  }
}

function showFatal(message) {
  $('#hero').innerHTML = `<h2>Ups</h2><p class="muted">${esc(message)}</p><a class="btn btn-primary" href="/">Ke halaman depan</a>`;
  $('#content').classList.add('hidden');
  $('#bottombar').classList.add('hidden');
}

// ---------- tab ----------
function showTab(name) {
  state.tab = name;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('#panel-photos').classList.toggle('hidden', name === 'messages');
  $('#panel-messages').classList.toggle('hidden', name !== 'messages');
  renderPhotos();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

function updateCounts() {
  $('#c-public').textContent = state.photos.filter((p) => p.visibility === 'public').length;
  $('#c-private').textContent = state.photos.filter((p) => p.visibility === 'private').length;
  $('#c-messages').textContent = state.messages.length;
}

// ---------- galeri ----------
function lockText(p) {
  if (p.request_status === 'pending') return ['⏳', 'Menunggu persetujuan'];
  if (p.request_status === 'rejected') return ['🚫', 'Akses ditolak'];
  return ['🔒', 'Privat · ketuk untuk minta akses'];
}

function renderPhotos() {
  if (state.tab === 'messages') return;
  const box = $('#panel-photos');
  const list = state.photos.filter((p) => p.visibility === state.tab);
  const note =
    state.tab === 'private'
      ? '<div class="alert alert-info small">Foto privat tampil buram untuk orang lain. Kamu bisa meminta akses ke pemiliknya, dan fotomu sendiri selalu tampil jelas.</div>'
      : '';
  box.innerHTML = note + '<div class="photo-grid" id="grid"></div>';
  const grid = $('#grid', box);
  if (!list.length) {
    grid.outerHTML = `<div class="empty">${state.tab === 'private' ? 'Belum ada foto privat.' : 'Belum ada foto publik. Jadilah yang pertama mengunggah!'}</div>`;
    return;
  }
  list.forEach((p) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'photo';
    let html = `<img loading="lazy" src="${esc(p.thumb_url)}" alt="Foto dari ${esc(p.guest_name)}" />`;
    if (p.media_type === 'video') html += '<span class="play">▶ Video</span>';
    if (p.can_view) {
      if (p.is_mine) html += `<span class="tag badge ${p.visibility === 'private' ? 'badge-private' : 'badge-public'}">${p.visibility === 'private' ? 'Privat · milikmu' : 'Milikmu'}</span>`;
      html += `<span class="by">${esc(p.guest_name)}</span>`;
    } else {
      const [icon, text] = lockText(p);
      html += `<div class="lock"><span class="big">${icon}</span><span>${text}</span></div>`;
    }
    tile.innerHTML = html;
    tile.addEventListener('click', () => openPhoto(p));
    grid.appendChild(tile);
  });
}

function openPhoto(p) {
  // Foto yang belum boleh dilihat: tampilkan versi buram dan tombol minta akses
  if (!p.can_view) {
    const [, text] = lockText(p);
    const canAsk = p.request_status !== 'pending';
    const m = openModal(`
      <div class="stack">
        <img class="lightbox-img" src="${esc(p.thumb_url)}" alt="Foto privat" />
        <div class="alert alert-info">Foto ini milik <b>${esc(p.guest_name)}</b> dan ditandai privat. ${esc(text)}.</div>
        ${
          canAsk
            ? `<div class="field"><label for="r-name">Namamu (agar pemilik tahu siapa yang meminta)</label>
               <input id="r-name" type="text" maxlength="40" value="${esc(prefs.name)}" placeholder="Contoh: Dina" /></div>
               <button class="btn btn-primary btn-block" type="button" id="r-send">${p.request_status === 'rejected' ? 'Minta akses lagi' : 'Minta akses'}</button>`
            : '<button class="btn btn-block" type="button" disabled>Permintaan terkirim, menunggu pemilik acara</button>'
        }
      </div>`);
    const send = $('#r-send', m.box);
    if (send)
      send.addEventListener('click', async () => {
        const name = $('#r-name', m.box).value.trim();
        if (name) { prefs.name = name; store.set('dm_name', name); }
        send.disabled = true;
        try {
          await api(`${API}/photos/${p.id}/request`, { method: 'POST', json: { guest_name: prefs.name } });
          m.close();
          toast('Permintaan akses terkirim.');
          await loadPhotos();
        } catch (e) {
          toast(e.message, true);
          send.disabled = false;
        }
      });
    return;
  }

  const media =
    p.media_type === 'video'
      ? `<video class="lightbox-img" src="${esc(p.view_url)}" controls playsinline></video>`
      : `<img class="lightbox-img" src="${esc(p.view_url)}" alt="" />`;
  const mine = p.is_mine;
  const m = openModal(`
    <div class="stack">
      ${media}
      <div class="row">
        <span class="badge ${p.visibility === 'private' ? 'badge-private' : 'badge-public'}">${p.visibility === 'private' ? 'Privat' : 'Publik'}</span>
        <span class="small muted">Oleh ${esc(p.guest_name)} · ${esc(timeAgo(p.created_at))}</span>
      </div>
      ${!p.can_use ? '<div class="alert alert-info small">Kamu bisa melihat foto ini, tapi tidak bisa mengunduhnya.</div>' : ''}
      <div class="row">
        ${p.download_url ? `<a class="btn btn-primary grow" href="${esc(p.download_url)}">Unduh</a>` : ''}
        ${mine ? '<button class="btn btn-danger" type="button" data-del>Hapus</button>' : ''}
      </div>
      ${
        mine
          ? `<div class="card card-pad stack">
              <b>Pengaturan foto kamu</b>
              <div class="segmented">
                <label><input type="radio" name="vis" value="public" ${p.visibility === 'public' ? 'checked' : ''} /><span>Publik</span></label>
                <label><input type="radio" name="vis" value="private" ${p.visibility === 'private' ? 'checked' : ''} /><span>Privat</span></label>
              </div>
              <label class="check" id="allow-row"><input id="allow" type="checkbox" ${p.allow_template ? 'checked' : ''} />
                <span>Boleh dipakai orang lain di template dan kolase</span></label>
              <button class="btn" type="button" data-save>Simpan pengaturan</button>
            </div>`
          : ''
      }
    </div>`);

  if (mine) {
    const sync = () => $('#allow-row', m.box).classList.toggle('hidden', $('input[name=vis]:checked', m.box).value !== 'public');
    $$('input[name=vis]', m.box).forEach((r) => r.addEventListener('change', sync));
    sync();
    $('[data-save]', m.box).addEventListener('click', async () => {
      try {
        await api(`${API}/photos/${p.id}`, {
          method: 'PATCH',
          json: { visibility: $('input[name=vis]:checked', m.box).value, allow_template: $('#allow', m.box).checked },
        });
        m.close();
        toast('Pengaturan disimpan.');
        await loadPhotos();
      } catch (e) {
        toast(e.message, true);
      }
    });
    $('[data-del]', m.box).addEventListener('click', async () => {
      if (!confirm('Hapus fotomu dari album ini?')) return;
      try {
        await api(`${API}/photos/${p.id}`, { method: 'DELETE' });
        m.close();
        toast('Foto dihapus.');
        await Promise.all([loadPhotos(), loadMessages()]);
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
}

// ---------- pesan dan kesan ----------
function renderMessages() {
  const box = $('#panel-messages');
  box.innerHTML = `
    <button class="btn btn-primary btn-block" type="button" id="write-msg" ${isOpen() ? '' : 'disabled'}>💌 Tulis pesan atau rekam suara</button>
    <div class="list" id="msg-list"></div>`;
  $('#write-msg', box).addEventListener('click', openMessageSheet);
  const list = $('#msg-list', box);
  if (!state.messages.length) {
    list.outerHTML = '<div class="empty">Belum ada pesan. Tulis ucapan atau kesanmu untuk yang punya acara.</div>';
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
      ${m.can_delete ? '<button class="btn btn-sm btn-ghost" type="button" aria-label="Hapus pesan">🗑</button>' : ''}`;
    const del = $('button', el);
    if (del)
      del.addEventListener('click', async () => {
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

// Perekam suara untuk pesan
function createRecorder(container) {
  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const rec = { blob: null, recorder: null, stream: null, timer: null, seconds: 0 };
  if (!supported) {
    container.innerHTML = '<div class="hint">Perekam suara tidak tersedia di browser ini. Kamu tetap bisa menulis pesan.</div>';
    return rec;
  }
  const draw = () => {
    if (rec.blob) {
      container.innerHTML = `<audio controls src="${URL.createObjectURL(rec.blob)}"></audio>
        <div><button class="btn btn-sm" type="button" id="rec-clear">Hapus rekaman</button></div>`;
      $('#rec-clear', container).onclick = () => { rec.blob = null; draw(); };
    } else if (rec.recorder) {
      container.innerHTML = `<button class="btn btn-danger btn-block" type="button" id="rec-stop">⏹ Berhenti (${rec.seconds}s)</button>`;
      $('#rec-stop', container).onclick = stop;
    } else {
      container.innerHTML = '<button class="btn btn-block" type="button" id="rec-start">🎙 Rekam suara (maks. 60 detik)</button>';
      $('#rec-start', container).onclick = start;
    }
  };
  async function start() {
    try {
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return toast('Izin mikrofon ditolak. Aktifkan mikrofon di browser untuk merekam.', true);
    }
    const chunks = [];
    rec.recorder = new MediaRecorder(rec.stream);
    rec.recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.recorder.onstop = () => {
      rec.blob = new Blob(chunks, { type: rec.recorder.mimeType || 'audio/webm' });
      rec.stream.getTracks().forEach((t) => t.stop());
      clearInterval(rec.timer);
      rec.recorder = null;
      draw();
    };
    rec.seconds = 0;
    rec.recorder.start();
    rec.timer = setInterval(() => {
      rec.seconds++;
      if (rec.seconds >= 60) stop();
      else draw();
    }, 1000);
    draw();
  }
  function stop() { if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop(); }
  rec.cancel = () => { clearInterval(rec.timer); if (rec.recorder) { rec.recorder.onstop = null; try { rec.recorder.stop(); } catch (e) { /* abaikan */ } } if (rec.stream) rec.stream.getTracks().forEach((t) => t.stop()); };
  draw();
  return rec;
}

function openMessageSheet() {
  const m = openModal(`
    <h2>Tulis pesan</h2>
    <form class="stack" novalidate>
      <div class="field"><label for="m-name">Namamu</label><input id="m-name" type="text" maxlength="40" value="${esc(prefs.name)}" placeholder="Contoh: Dina" /></div>
      <div class="field"><label for="m-text">Pesan atau kesan</label><textarea id="m-text" maxlength="300" placeholder="Tulis ucapanmu di sini..."></textarea></div>
      <div class="field"><label>Atau rekam suara</label><div id="m-rec"></div></div>
      <div class="hint">Pesan dan kesan selalu tampil untuk semua orang.</div>
      <button class="btn btn-primary btn-block" type="submit">Kirim pesan</button>
    </form>`, { onClose: () => rec.cancel && rec.cancel() });
  const rec = createRecorder($('#m-rec', m.box));
  $('form', m.box).addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#m-text', m.box).value.trim();
    if (!text && !rec.blob) return toast('Tulis pesan atau rekam suara dulu.', true);
    const name = $('#m-name', m.box).value.trim();
    if (name) { prefs.name = name; store.set('dm_name', name); }
    const fd = new FormData();
    fd.append('guest_name', prefs.name);
    fd.append('text', text);
    if (rec.blob) fd.append('audio', new File([rec.blob], 'suara.' + (rec.blob.type.includes('mp4') ? 'm4a' : rec.blob.type.includes('ogg') ? 'ogg' : 'webm'), { type: rec.blob.type }));
    const button = $('button[type=submit]', m.box);
    button.disabled = true;
    try {
      await api(`${API}/messages`, { method: 'POST', body: fd });
      m.close();
      toast('Pesan terkirim. Terima kasih!');
      await loadMessages();
      showTab('messages');
    } catch (err) {
      toast(err.message, true);
      button.disabled = false;
    }
  });
}

// ---------- unggah foto dan video ----------
function openUploadSheet() {
  if (!isOpen()) return toast('Waktu unggah sudah ditutup.', true);
  const m = openModal(`
    <h2>Unggah foto atau video</h2>
    <div class="stack">
      <div class="field"><label for="u-name">Namamu</label><input id="u-name" type="text" maxlength="40" value="${esc(prefs.name)}" placeholder="Contoh: Dina" /></div>
      <div class="field"><label>Siapa yang boleh melihat?</label>
        <div class="segmented">
          <label><input type="radio" name="u-vis" value="public" ${prefs.visibility === 'public' ? 'checked' : ''} /><span>🌍 Publik</span></label>
          <label><input type="radio" name="u-vis" value="private" ${prefs.visibility === 'private' ? 'checked' : ''} /><span>🔒 Privat</span></label>
        </div>
        <span class="hint" id="u-hint"></span>
      </div>
      <label class="check" id="u-allow-row"><input id="u-allow" type="checkbox" ${prefs.allow_template ? 'checked' : ''} /><span>Boleh dipakai orang lain di template dan kolase</span></label>
      <div class="field"><label for="u-text">Pesan untuk foto ini (opsional)</label><input id="u-text" type="text" maxlength="300" value="${esc(prefs.text)}" placeholder="Contoh: Momen favoritku!" /></div>
      <div class="row">
        <button class="btn btn-primary grow" type="button" data-src="camera">📷 Ambil foto</button>
        <button class="btn grow" type="button" data-src="video">🎥 Rekam video</button>
      </div>
      <button class="btn btn-block" type="button" data-src="gallery">🖼 Pilih dari galeri</button>
      <div class="hint center">Setelah memilih, unggahan dimulai otomatis dalam 3 detik. Kamu bisa membatalkannya.</div>
    </div>`);

  const readPrefs = () => {
    const name = $('#u-name', m.box).value.trim();
    if (name) store.set('dm_name', name);
    prefs.name = name;
    prefs.visibility = $('input[name=u-vis]:checked', m.box).value;
    prefs.allow_template = $('#u-allow', m.box).checked;
    prefs.text = $('#u-text', m.box).value.trim();
  };
  const sync = () => {
    const priv = $('input[name=u-vis]:checked', m.box).value === 'private';
    $('#u-allow-row', m.box).classList.toggle('hidden', priv);
    $('#u-hint', m.box).textContent = priv
      ? 'Orang lain hanya melihat versi buram dan harus meminta akses kepadamu.'
      : 'Semua orang yang membuka album ini bisa melihat dan mengunduhnya.';
  };
  $$('input[name=u-vis]', m.box).forEach((r) => r.addEventListener('change', sync));
  sync();

  $$('[data-src]', m.box).forEach((b) =>
    b.addEventListener('click', async () => {
      readPrefs();
      const src = b.dataset.src;
      if (src === 'camera') {
        const used = await openLiveCamera((file) => { m.close(); queueUpload([file]); });
        if (used) return;
        $('#in-camera').click(); // cadangan: kamera bawaan HP
      } else if (src === 'video') $('#in-video').click();
      else $('#in-gallery').click();
      m.close();
    })
  );
}

// Kamera langsung di halaman (butuh HTTPS atau localhost). Mengembalikan false kalau tidak bisa dipakai.
async function openLiveCamera(onShot) {
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || !window.isSecureContext) return false;
  let facing = 'environment';
  let stream;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:120;background:#000;display:flex;flex-direction:column';
  overlay.innerHTML = `
    <video autoplay playsinline muted style="flex:1;min-height:0;width:100%;object-fit:contain;background:#000"></video>
    <div style="display:flex;align-items:center;justify-content:space-around;padding:18px 12px calc(18px + env(safe-area-inset-bottom));background:#111">
      <button type="button" data-x class="btn" style="width:64px">✕</button>
      <button type="button" data-shot aria-label="Ambil foto" style="width:72px;height:72px;border-radius:50%;border:5px solid #fff;background:var(--accent);cursor:pointer"></button>
      <button type="button" data-flip class="btn" style="width:64px">🔄</button>
    </div>`;
  const video = $('video', overlay);

  async function startStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false });
    video.srcObject = stream;
  }
  try {
    await startStream();
  } catch (e) {
    toast('Kamera tidak bisa dibuka. Memakai kamera bawaan HP.', true);
    return false;
  }
  document.body.appendChild(overlay);
  const close = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); overlay.remove(); };
  $('[data-x]', overlay).onclick = close;
  $('[data-flip]', overlay).onclick = async () => {
    facing = facing === 'environment' ? 'user' : 'environment';
    try { await startStream(); } catch (e) { toast('Tidak bisa berganti kamera.', true); }
  };
  $('[data-shot]', overlay).onclick = () => {
    if (!video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return toast('Gagal mengambil foto. Coba lagi.', true);
        close();
        onShot(new File([blob], `kamera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  };
  return true;
}

$('#in-gallery').addEventListener('change', (e) => takeFiles(e.target));
$('#in-camera').addEventListener('change', (e) => takeFiles(e.target));
$('#in-video').addEventListener('change', (e) => takeFiles(e.target));
function takeFiles(input) {
  const files = Array.from(input.files || []);
  input.value = '';
  queueUpload(files);
}

// Foto sangat besar dikecilkan dulu supaya muat batas server (15 MB)
async function shrinkIfHuge(file) {
  if (!file.type.startsWith('image/') || file.size <= 10 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 3200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) {
    return file;
  }
}

// Unggahan otomatis dimulai 3 detik setelah memilih, dengan tombol Batalkan
function queueUpload(files) {
  files = files.filter(Boolean);
  if (!files.length) return;
  const snapshot = { ...prefs };
  const bar = document.createElement('div');
  bar.className = 'undo-bar';
  bar.innerHTML = `<span>Mengunggah ${files.length} file...</span><button type="button">Batalkan</button><div class="undo-progress"></div>`;
  document.body.appendChild(bar);
  const timer = setTimeout(() => { bar.remove(); runUploads(files, snapshot); }, 3000);
  $('button', bar).onclick = () => { clearTimeout(timer); bar.remove(); toast('Unggahan dibatalkan.'); };
}

async function runUploads(files, snap) {
  // Daftar progres unggahan: tiap file punya bar, tombol Batal, dan tombol "Coba lagi" kalau gagal
  const panel = document.createElement('div');
  panel.className = 'upload-list';
  panel.innerHTML = '<div class="row-between"><b class="small" id="up-title"></b><button class="btn btn-sm" type="button" id="up-close" hidden>Tutup</button></div><div id="up-rows" class="stack" style="gap:10px"></div>';
  document.body.appendChild(panel);
  const rowsBox = $('#up-rows', panel);
  const jobs = files.map((file, i) => {
    const row = document.createElement('div');
    row.className = 'upload-row';
    row.innerHTML = `<div class="top"><span class="name"></span><span class="small muted st">Menunggu</span><button class="btn btn-sm" type="button" data-act hidden></button></div><div class="progress"><span></span></div>`;
    $('.name', row).textContent = file.name || 'Berkas ' + (i + 1);
    rowsBox.appendChild(row);
    return { file, row, index: i, status: 'wait', handle: {}, first: i === 0 };
  });
  let okCount = 0;
  let stopAll = false;

  const refreshTitle = () => {
    const done = jobs.filter((j) => j.status === 'done').length;
    const busyN = jobs.filter((j) => j.status === 'wait' || j.status === 'run').length;
    $('#up-title', panel).textContent = busyN ? `Mengunggah ${done}/${jobs.length}...` : done === jobs.length ? 'Berhasil diunggah' : 'Sebagian gagal diunggah';
    $('#up-close', panel).hidden = !!busyN;
  };

  async function runJob(job) {
    const st = $('.st', job.row), bar = $('.progress span', job.row), act = $('[data-act]', job.row);
    job.status = 'run';
    job.row.className = 'upload-row';
    st.textContent = '0%';
    bar.style.width = '0';
    act.hidden = false;
    act.textContent = 'Batal';
    act.onclick = () => job.handle.abort && job.handle.abort();
    refreshTitle();
    try {
      const file = await shrinkIfHuge(job.file);
      const fd = new FormData();
      fd.append('media', file);
      fd.append('visibility', snap.visibility);
      fd.append('allow_template', snap.allow_template && snap.visibility === 'public' ? '1' : '0');
      fd.append('guest_name', snap.name);
      if (job.first && snap.text) fd.append('text', snap.text);
      await uploadWithProgress(API + '/photos', fd, (pct) => { bar.style.width = pct + '%'; st.textContent = pct + '%'; }, job.handle);
      job.status = 'done';
      job.row.classList.add('done');
      st.textContent = 'Selesai ✓';
      bar.style.width = '100%';
      act.hidden = true;
      okCount++;
    } catch (e) {
      job.status = 'failed';
      job.row.classList.add('failed');
      st.textContent = e.aborted ? 'Dibatalkan' : e.message;
      act.hidden = false;
      act.textContent = 'Coba lagi';
      act.onclick = async () => { await runJob(job); finish(); };
      if (!e.aborted && e.status === 403) { stopAll = true; act.hidden = true; } // waktu ditutup atau kapasitas penuh
    }
    refreshTitle();
  }

  async function finish() {
    if (okCount) {
      prefs.text = '';
      state.tab !== snap.visibility && state.tab !== 'messages' && showTab(snap.visibility);
      await Promise.all([loadPhotos(), loadMessages()]).catch(() => {});
    }
    refreshTitle();
    if (jobs.every((j) => j.status === 'done')) {
      toast(jobs.length === 1 ? 'Foto terunggah. Terima kasih!' : `${jobs.length} file terunggah. Terima kasih!`);
      setTimeout(() => panel.remove(), 1500);
    }
  }

  $('#up-close', panel).onclick = () => panel.remove();
  for (const job of jobs) {
    if (stopAll) { job.status = 'failed'; job.row.classList.add('failed'); $('.st', job.row).textContent = 'Tidak diunggah'; continue; }
    await runJob(job);
  }
  await finish();
}

// ---------- memuat data ----------
let lastPhotos = '';
let lastMessages = '';
async function loadPhotos() {
  const data = await api(`${API}/photos`);
  const key = JSON.stringify(data);
  if (key === lastPhotos) return;
  lastPhotos = key;
  state.photos = data;
  updateCounts();
  renderPhotos();
}
async function loadMessages() {
  const data = await api(`${API}/messages`);
  const key = JSON.stringify(data);
  if (key === lastMessages) return;
  lastMessages = key;
  state.messages = data;
  updateCounts();
  renderMessages();
}

$('#btn-upload').addEventListener('click', openUploadSheet);
$('#btn-collage').addEventListener('click', () => {
  if (typeof openStudio !== 'function') return toast('Fitur kolase belum tersedia.', true);
  openStudio({ code, info: state.info, photos: state.photos });
});

// ---------- T-01: layar sambutan tamu (muncul sekali per sesi setelah scan QR / buka link) ----------
function showWelcome() {
  const a = state.info;
  let seen = false;
  try { seen = sessionStorage.getItem('dm_welcome_' + code) === '1'; } catch (e) { /* abaikan */ }
  if (seen || a.is_owner) return;
  const w = document.createElement('div');
  w.className = 'welcome';
  w.innerHTML = `<div class="welcome-card">
    <div style="font-size:2.4rem">🎉</div>
    <div class="small muted">${a.event_date ? esc(formatDate(a.event_date)) : 'Album acara'}</div>
    <h1>${esc(a.title)}</h1>
    <p class="muted">${esc(a.description || 'Selamat datang! Lihat dan bagikan momen acara di sini. Tanpa perlu membuat akun.')}</p>
    <button class="btn btn-primary btn-block" type="button" id="enter-album">Masuk ke album</button>
    <p class="small muted mt">${a.upload_open ? 'Kamu bisa mengunggah foto dan video sampai ' + esc(formatDateTime(a.upload_until)) + '.' : 'Unggahan sudah ditutup, tapi kamu masih bisa melihat album.'}</p>
  </div>`;
  document.body.appendChild(w);
  $('#enter-album', w).onclick = () => {
    try { sessionStorage.setItem('dm_welcome_' + code, '1'); } catch (e) { /* abaikan */ }
    w.remove();
  };
}

// ---------- T-05 / T-06: kabar keputusan pemilik atas permintaan akses ----------
async function checkNotices() {
  let list;
  try { list = await api(API + '/notifications'); } catch (e) { return; }
  const key = 'dm_seen_' + code;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { /* abaikan */ }
  const box = $('#notices');
  if (!box) return;
  list.forEach((n) => {
    const tag = n.id + ':' + n.status;
    if (seen.includes(tag) || document.getElementById('n-' + n.id)) return;
    const ok = n.status === 'approved';
    const el = document.createElement('div');
    el.id = 'n-' + n.id;
    el.className = 'status-banner ' + (ok ? 'ok' : 'no');
    el.innerHTML = `<span>${ok ? '✅' : '⛔'}</span><span>${ok ? '<b>Akses disetujui.</b> Foto privat yang kamu minta kini terbuka.' : '<b>Akses ditolak.</b> Pemilik tidak membuka foto itu, jadi tetap buram.'}</span><button type="button" aria-label="Tutup">×</button>`;
    $('button', el).onclick = () => {
      el.remove();
      seen.push(tag);
      try { localStorage.setItem(key, JSON.stringify(seen.slice(-100))); } catch (e) { /* abaikan */ }
    };
    box.appendChild(el);
    toast(ok ? 'Akses disetujui, foto terbuka.' : 'Permintaan akses ditolak.', !ok);
  });
}

(async function init() {
  if (!code) return showFatal('Kode album tidak ditemukan.');
  try {
    state.info = await api(API);
  } catch (e) {
    return showFatal(e.message);
  }
  renderHero();
  $('#content').classList.remove('hidden');
  showWelcome();
  try {
    await Promise.all([loadPhotos(), loadMessages()]);
  } catch (e) {
    toast(e.message, true);
  }
  renderMessages();
  renderPhotos();
  checkNotices();

  // Segarkan otomatis tiap 30 detik supaya foto baru dari tamu lain muncul
  setInterval(async () => {
    if (document.hidden || $('.modal')) return;
    try {
      state.info = await api(API);
      renderHero();
      await Promise.all([loadPhotos(), loadMessages()]);
      await checkNotices();
    } catch (e) { /* abaikan, coba lagi nanti */ }
  }, 30000);
})();