// Dashboard pemilik acara: daftar album, buat album baru, dan ganti paket.

let me = null;

function renderAccount() {
  $('#hello').textContent = 'Halo, ' + me.name;
  $('#plan-name').textContent = me.planInfo.label + ' · ' + me.planInfo.price;
  $('#plan-detail').textContent = `Maksimal ${me.planInfo.maxPhotos} foto dan ${me.planInfo.maxTemplates} template untuk setiap album`;
}

// ---------- modal QR album ----------
function openQrModal(album) {
  const qrSrc = `/api/albums/${album.id}/qr.png?t=${Date.now()}`;
  const qrDownload = `/api/albums/${album.id}/qr.png?download=1`;
  const m = openModal(`
    <div class="stack" style="align-items:center;text-align:center">
      <h2 style="margin-bottom:4px">📸 QR Album</h2>
      <div class="muted small" style="margin-bottom:12px"><b>${esc(album.title)}</b> · Kode <b>${esc(album.code)}</b></div>
      <img src="${qrSrc}" alt="Kode QR album ${esc(album.title)}"
           style="width:220px;height:220px;border-radius:12px;border:2px solid var(--border)" />
      <div class="url-box" style="font-size:.8rem;word-break:break-all;margin:8px 0">${esc(album.guest_url)}</div>
      <div class="row" style="justify-content:center;flex-wrap:wrap;gap:8px">
        <a class="btn btn-primary btn-sm" href="${qrDownload}" download="qr-${esc(album.code)}.png">⬇ Unduh QR</a>
        <button class="btn btn-sm" type="button" id="qr-copy-link">🔗 Salin link</button>
        <a class="btn btn-sm" href="/owner/album.html?id=${album.id}">Kelola album →</a>
      </div>
      <p class="hint" style="margin-top:8px">Cetak QR ini di undangan, tiket, atau tampilkan di layar supaya tamu bisa scan dan mengunggah foto.</p>
    </div>`);
  $('#qr-copy-link', m.box).addEventListener('click', () => copyText(album.guest_url, 'Link album disalin!'));
}

function albumCard(a) {
  const open = a.upload_open;
  const card = document.createElement('div');
  card.className = 'card album-card';
  card.style.setProperty('--accent', a.theme_color);
  card.innerHTML = `
    <div class="color-strip" style="background:${esc(a.theme_color)}"></div>
    <div class="body">
      <div>
        <h3 style="margin-bottom:2px">${esc(a.title)}</h3>
        <div class="small muted">${a.event_date ? esc(formatDate(a.event_date)) : 'Tanggal belum diatur'} · Kode <b>${esc(a.code)}</b></div>
      </div>
      <div class="row">
        <span class="badge ${open ? 'badge-public' : 'badge-warn'}">${open ? 'Unggahan tamu dibuka' : 'Unggahan ditutup'}</span>
        ${a.pending_requests ? `<span class="badge badge-private">${a.pending_requests} permintaan akses</span>` : ''}
      </div>
      <div class="stats">
        <div class="stat"><b>${a.photo_count}</b><span>Foto</span></div>
        <div class="stat"><b>${a.private_count}</b><span>Privat</span></div>
        <div class="stat"><b>${a.message_count}</b><span>Pesan</span></div>
      </div>
      <div class="row" style="margin-top:auto">
        <a class="btn btn-primary grow" href="/owner/album.html?id=${a.id}">Kelola</a>
        <button class="btn btn-sm" type="button" data-qr title="Lihat QR">QR</button>
        <button class="btn" type="button" data-copy>Salin link</button>
      </div>
    </div>`;
  $('[data-copy]', card).addEventListener('click', () => copyText(a.guest_url, 'Link album disalin'));
  $('[data-qr]', card).addEventListener('click', () => openQrModal(a));
  return card;
}

async function loadAlbums() {
  const box = $('#albums');
  try {
    const albums = await api('/api/albums');
    box.innerHTML = '';
    if (!albums.length) {
      box.innerHTML = '<div class="empty" style="grid-column:1/-1">Belum ada album. Klik <b>+ Buat album</b> untuk membuat album acara pertamamu.</div>';
      return;
    }
    albums.forEach((a) => box.appendChild(albumCard(a)));
  } catch (e) {
    box.innerHTML = `<div class="alert alert-error" style="grid-column:1/-1">${esc(e.message)}</div>`;
  }
}

// Modal QR yang ditampilkan langsung setelah album berhasil dibuat
function openNewAlbumQr(album) {
  const qrSrc = `/api/albums/${album.id}/qr.png?t=${Date.now()}`;
  const m = openModal(`
    <div class="stack" style="align-items:center;text-align:center">
      <div style="font-size:2rem">🎉</div>
      <h2 style="margin:4px 0 2px">Album berhasil dibuat!</h2>
      <div class="muted small" style="margin-bottom:12px"><b>${esc(album.title)}</b> · Kode <b>${esc(album.code)}</b></div>
      <img src="${qrSrc}" alt="Kode QR album ${esc(album.title)}"
           style="width:240px;height:240px;border-radius:14px;border:3px solid var(--accent)" />
      <div class="url-box" style="font-size:.8rem;word-break:break-all;margin:10px 0">${esc(album.guest_url)}</div>
      <div class="row" style="justify-content:center;flex-wrap:wrap;gap:8px">
        <a class="btn btn-primary" href="/api/albums/${album.id}/qr.png?download=1" download="qr-${esc(album.code)}.png">⬇ Unduh QR</a>
        <button class="btn" type="button" id="qr-new-copy">🔗 Salin link tamu</button>
      </div>
      <div class="row" style="justify-content:center;margin-top:4px">
        <a class="btn btn-sm" href="/owner/album.html?id=${album.id}">Kelola album →</a>
      </div>
      <p class="hint" style="margin-top:8px">Bagikan QR ini di undangan atau layar proyektor supaya tamu bisa scan dan mengunggah foto langsung.</p>
    </div>`);
  $('#qr-new-copy', m.box).addEventListener('click', () => copyText(album.guest_url, 'Link album disalin!'));
}

// ---------- buat album ----------
function openNewAlbum() {
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const m = openModal(`
    <h2>Buat album baru</h2>
    <form class="stack" novalidate>
      <div id="f-error" class="alert alert-error hidden"></div>
      <div class="field">
        <label for="f-title">Nama acara</label>
        <input id="f-title" type="text" maxlength="100" placeholder="Contoh: Pernikahan Raka &amp; Sinta" />
      </div>
      <div class="field">
        <label for="f-date">Tanggal acara</label>
        <input id="f-date" type="date" value="${localToday}" />
      </div>
      <div class="field">
        <label for="f-desc">Sapaan untuk tamu (opsional)</label>
        <textarea id="f-desc" maxlength="300" placeholder="Contoh: Terima kasih sudah hadir! Unggah fotomu di sini."></textarea>
      </div>
      <div class="field">
        <label for="f-color">Warna tema album</label>
        <input id="f-color" type="color" value="#e8a0b4" />
      </div>
      <div class="field">
        <label for="f-days">Tamu boleh mengunggah sampai berapa hari setelah acara?</label>
        <input id="f-days" type="number" min="1" max="30" value="3" />
        <span class="hint">Setelah batas ini, tamu masih bisa melihat foto, tapi tidak bisa mengunggah lagi.</span>
      </div>
      <label class="check">
        <input id="f-private" type="checkbox" />
        <span>Jadikan foto baru <b>privat</b> secara bawaan (tamu masih bisa mengubahnya saat mengunggah)</span>
      </label>
      <button class="btn btn-primary btn-block" type="submit">Buat album</button>
    </form>`);

  const form = $('form', m.box);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#f-error', m.box);
    const title = $('#f-title', m.box).value.trim();
    error.classList.add('hidden');
    if (!title) {
      error.textContent = 'Nama acara wajib diisi.';
      return error.classList.remove('hidden');
    }
    const button = $('button[type=submit]', m.box);
    button.disabled = true;
    try {
      const album = await api('/api/albums', {
        method: 'POST',
        json: {
          title,
          event_date: $('#f-date', m.box).value,
          description: $('#f-desc', m.box).value,
          theme_color: $('#f-color', m.box).value,
          upload_days: Number($('#f-days', m.box).value) || 3,
          default_private: $('#f-private', m.box).checked,
        },
      });
      // Tutup form buat album, lalu tampilkan QR modal langsung
      m.close();
      openNewAlbumQr(album);
      loadAlbums(); // segarkan daftar album di background
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      button.disabled = false;
    }
  });
}

// ---------- ganti paket (pembayaran hanya simulasi) ----------
function openPlans() {
  const plans = [
    { key: 'basic', name: 'Basic', price: 'Gratis', points: ['Sampai 200 foto per album', '1 template buatan sendiri'] },
    { key: 'premium', name: 'Premium', price: 'Rp 99.000', points: ['Sampai 2.000 foto per album', '5 template buatan sendiri'] },
  ];
  const m = openModal(`
    <h2>Pilih paket</h2>
    <p class="muted small">Ini prototype, jadi pembayaran hanya simulasi dan tidak ada uang yang dipotong.</p>
    <div class="row" style="align-items:stretch">
      ${plans
        .map(
          (p) => `
        <div class="plan-card ${me.plan === p.key ? 'current' : ''}">
          <h3>${p.name}</h3>
          <div><b>${p.price}</b></div>
          <ul class="small" style="padding-left:18px">${p.points.map((x) => `<li>${x}</li>`).join('')}</ul>
          ${
            me.plan === p.key
              ? '<span class="badge badge-public">Paket saat ini</span>'
              : `<button class="btn btn-primary btn-block" type="button" data-plan="${p.key}">Pilih ${p.name}</button>`
          }
        </div>`
        )
        .join('')}
    </div>`);

  $$('[data-plan]', m.box).forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        me = await api('/api/auth/upgrade', { method: 'POST', json: { plan: btn.dataset.plan } });
        renderAccount();
        m.close();
        toast('Paket berhasil diganti ke ' + me.planInfo.label + ' (simulasi).');
      } catch (err) {
        btn.disabled = false;
        toast(err.message, true);
      }
    })
  );
}

(async function init() {
  me = await requireLogin();
  renderAccount();
  $('#logout').addEventListener('click', logout);
  $('#new-album').addEventListener('click', openNewAlbum);
  $('#change-plan').addEventListener('click', openPlans);
  loadAlbums();
  document.addEventListener('notif:update', loadAlbums);
})();