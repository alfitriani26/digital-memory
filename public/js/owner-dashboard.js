// Dashboard pemilik acara: daftar album, buat album baru, dan ganti paket.

let me = null;

function renderAccount() {
  $('#hello').textContent = 'Halo, ' + me.name;
  $('#plan-name').textContent = me.planInfo.label + ' · ' + me.planInfo.price;
  $('#plan-detail').textContent = `Maksimal ${me.planInfo.maxPhotos} foto dan ${me.planInfo.maxTemplates} template untuk setiap album`;
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
        <button class="btn" type="button" data-copy>Salin link</button>
      </div>
    </div>`;
  $('[data-copy]', card).addEventListener('click', () => copyText(a.guest_url));
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
      location.href = '/owner/album.html?id=' + album.id;
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
})();