// Notifikasi untuk pemilik acara: ikon lonceng di bilah atas, pusat notifikasi,
// dan banner yang muncul saat ada permintaan akses baru. Dipakai di dashboard dan kelola album.

(function () {
  const ICON = { access_request: '🔒', message: '💬', photo: '📷', closing: '⏰' };
  let items = [];
  let unread = 0;
  let knownMax = null; // id notifikasi terbesar yang sudah pernah dilihat di sesi ini
  let panel = null;

  const nav = document.querySelector('.topbar nav');
  if (!nav) return;
  const wrap = document.createElement('div');
  wrap.className = 'notif-wrap';
  wrap.innerHTML = '<button class="bell" type="button" aria-label="Notifikasi">🔔<span class="dot hidden"></span></button>';
  nav.insertBefore(wrap, nav.firstChild);
  const bell = wrap.querySelector('.bell');
  const dot = wrap.querySelector('.dot');

  function target(n) {
    const tab = n.type === 'access_request' ? 'requests' : n.type === 'message' ? 'messages' : n.type === 'photo' ? 'photos' : 'settings';
    return `/owner/album.html?id=${n.album_id}#${tab}`;
  }

  function renderBell() {
    dot.textContent = unread > 9 ? '9+' : unread;
    dot.classList.toggle('hidden', !unread);
  }

  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = `
      <div class="notif-head"><b>Notifikasi</b><button class="btn btn-sm" type="button" data-all ${unread ? '' : 'disabled'}>Tandai semua dibaca</button></div>
      <div class="notif-list">${
        items.length
          ? items
              .map(
                (n) => `<button class="notif-item ${n.read_at ? '' : 'unread'}" type="button" data-id="${n.id}">
                  <span class="ico">${ICON[n.type] || '🔔'}</span>
                  <span><span>${esc(n.text)}</span><br /><span class="small muted">${esc(timeAgo(n.created_at))}</span></span></button>`
              )
              .join('')
          : '<div class="notif-empty">Belum ada notifikasi.</div>'
      }</div>`;
    panel.querySelector('[data-all]').onclick = async () => {
      await api('/api/notifications/read-all', { method: 'POST' });
      await load(true);
    };
    panel.querySelectorAll('.notif-item').forEach((b) => {
      b.onclick = async () => {
        const n = items.find((x) => String(x.id) === b.dataset.id);
        try { await api(`/api/notifications/${n.id}/read`, { method: 'POST' }); } catch (e) { /* abaikan */ }
        const samePage = location.pathname.endsWith('album.html') && new URLSearchParams(location.search).get('id') === String(n.album_id);
        location.href = target(n);
        if (samePage) location.reload();
      };
    });
  }

  function showBanner(n) {
    const old = document.querySelector('.banner');
    if (old) old.remove();
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = `<span>${ICON[n.type] || '🔔'}</span><span class="grow small">${esc(n.text)}</span><a class="btn btn-sm btn-primary" href="${target(n)}">Lihat</a><button class="x" type="button" aria-label="Tutup">×</button>`;
    document.body.appendChild(b);
    const kill = () => b.remove();
    b.querySelector('.x').onclick = kill;
    b.querySelector('a').addEventListener('click', () => { if (location.pathname.endsWith('album.html')) setTimeout(() => location.reload(), 50); });
    setTimeout(kill, 8000);
  }

  async function load(silent) {
    try {
      const data = await api('/api/notifications');
      items = data.items;
      unread = data.unread;
      const max = items.reduce((m, n) => Math.max(m, n.id), 0);
      if (knownMax !== null && !silent) {
        // Banner hanya untuk notifikasi baru yang belum dibaca; permintaan akses diprioritaskan
        const fresh = items.filter((n) => n.id > knownMax && !n.read_at);
        const pick = fresh.find((n) => n.type === 'access_request') || fresh[0];
        if (pick) showBanner(pick);
      }
      knownMax = Math.max(knownMax || 0, max);
      renderBell();
      renderPanel();
      document.dispatchEvent(new CustomEvent('notif:update', { detail: data }));
    } catch (e) { /* abaikan, coba lagi nanti */ }
  }

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement('div');
    panel.className = 'notif-panel';
    wrap.appendChild(panel);
    renderPanel();
  });
  document.addEventListener('click', (e) => { if (panel && !wrap.contains(e.target)) { panel.remove(); panel = null; } });

  load(true);
  setInterval(() => { if (!document.hidden) load(false); }, 20000);
})();
