// Panduan awal untuk pemilik acara (frame O-04a): sorotan pada tombol "+ Buat album" di dashboard.
// Muncul SEKALI per akun di perangkat ini, jadi tidak muncul lagi walau pemilik kembali ke dashboard berkali-kali.
// Tidak mengubah file lain: gaya CSS ditambahkan dari sini.

(function () {
  const target = () => document.getElementById('new-album');
  if (!target()) return;

  const css = `
  .og-spot { position: fixed; z-index: 90; border-radius: 999px; box-shadow: 0 0 0 100vmax rgba(43,35,48,.68); border: 2.5px solid #fff; pointer-events: none; transition: all .15s; }
  .og-block { position: fixed; inset: 0; z-index: 89; }
  .og-bubble { position: fixed; z-index: 91; width: min(342px, 92vw); background: #fff; border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
  .og-bubble:before { content: ''; position: absolute; top: -9px; right: var(--arrow, 40px); border: 9px solid transparent; border-top: 0; border-bottom-color: #fff; }
  .og-bubble small { color: #a8647d; font-weight: 700; font-size: .78rem; display: block; }
  .og-bubble h3 { font-family: Georgia, 'Times New Roman', serif; font-size: 1.3rem; margin: 6px 0; color: #2b2326; }
  .og-bubble p { color: #7a7280; font-size: .9rem; line-height: 1.45; margin: 0 0 14px; }
  .og-bubble button { border: 0; border-radius: 999px; background: #be7a92; color: #fff; font: inherit; font-weight: 700; padding: 10px 22px; cursor: pointer; float: right; }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  let parts = [];
  function close(key) {
    try { localStorage.setItem(key, '1'); } catch (e) { /* abaikan */ }
    parts.forEach((p) => p.remove());
    parts = [];
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  }
  let spot, bubble;
  function place() {
    const b = target();
    if (!b || !spot) return;
    const r = b.getBoundingClientRect();
    const pad = 4;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const bw = Math.min(342, window.innerWidth * 0.92);
    const left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.right - bw));
    bubble.style.left = left + 'px';
    bubble.style.top = r.bottom + 18 + 'px';
    bubble.style.setProperty('--arrow', Math.max(16, left + bw - (r.left + r.width / 2) - 9) + 'px');
  }

  function show(key) {
    const block = document.createElement('div'); block.className = 'og-block';
    spot = document.createElement('div'); spot.className = 'og-spot';
    bubble = document.createElement('div'); bubble.className = 'og-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.innerHTML = '<small>Panduan singkat</small><h3>Mulai dari sini</h3><p>Buat album untuk acaramu, lalu bagikan kode QR atau link-nya ke para tamu.</p><button type="button">Mengerti</button><div style="clear:both"></div>';
    parts = [block, spot, bubble];
    parts.forEach((p) => document.body.appendChild(p));
    bubble.querySelector('button').addEventListener('click', () => close(key));
    block.addEventListener('click', () => close(key));
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    place();
  }

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => {
      if (!me) return;
      const key = 'dm_owner_guide_' + me.id;
      try { if (localStorage.getItem(key)) return; } catch (e) { /* tanpa localStorage: tetap tampil */ }
      // beri waktu dashboard selesai dimuat supaya posisi tombol sudah final
      setTimeout(() => { if (!document.querySelector('.modal')) show(key); }, 600);
    })
    .catch(() => {});
})();
