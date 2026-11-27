// Panduan awal untuk tamu (frame T-00c "Cara pakai"): tiga langkah singkat + ketentuan penggunaan.
// Muncul SEKALI per perangkat saat tamu pertama kali membuka album, setelah layar sambutan (kalau ada).
// Pemilik acara yang membuka halaman tamu tidak melihat panduan ini.
// Tidak mengubah file lain: gaya CSS ditambahkan dari sini.

(function () {
  const KEY = 'dm_onboarding_v1';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* tanpa localStorage: tetap tampil */ }
  const m = location.pathname.match(/\/a\/([^/?#]+)/);
  if (!m) return;

  const css = `
  .ob { position: fixed; inset: 0; z-index: 85; background: #fbf7f4; overflow-y: auto; display: flex; justify-content: center; }
  .ob-in { width: 100%; max-width: 480px; padding: 28px 20px 28px; display: flex; flex-direction: column; gap: 14px; min-height: 100%; }
  .ob-kicker { color: #a8647d; font-weight: 700; font-size: 0.85rem; margin: 6px 0 -8px; }
  .ob h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 1.7rem; margin: 0; color: #2b2326; }
  .ob-step { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid #ece2df; border-radius: 22px; padding: 16px 18px; }
  .ob-num { flex: none; width: 40px; height: 40px; border-radius: 50%; background: #be7a92; color: #fff; font-weight: 800; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; }
  .ob-step b { display: block; color: #2b2326; font-size: 1rem; margin-bottom: 2px; }
  .ob-step span { color: #7a7280; font-size: 0.86rem; line-height: 1.4; display: block; }
  .ob-terms { background: #f8eaee; border: 1px solid #f0cdd9; border-radius: 18px; padding: 16px 18px; color: #86415a; font-size: 0.86rem; line-height: 1.45; }
  .ob-terms b { display: block; font-size: 0.95rem; margin-bottom: 4px; }
  .ob-foot { margin-top: auto; text-align: center; color: #7a7280; font-size: 0.78rem; padding-top: 8px; }
  .ob-btn { border: 0; border-radius: 999px; background: #be7a92; color: #fff; font: inherit; font-weight: 700; font-size: 1rem; padding: 16px; cursor: pointer; width: 100%; }
  .ob-btn:hover { background: #a8647d; }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function show() {
    const ob = document.createElement('div');
    ob.className = 'ob';
    ob.setAttribute('role', 'dialog');
    ob.setAttribute('aria-label', 'Cara pakai Digital Memory');
    ob.innerHTML = `
      <div class="ob-in">
        <div class="ob-kicker">Selamat datang</div>
        <h1>Cara pakai Digital Memory</h1>
        <div class="ob-step"><div class="ob-num">1</div><div><b>Pilih foto atau video</b><span>Dari galeri, atau langsung foto dan rekam.</span></div></div>
        <div class="ob-step"><div class="ob-num">2</div><div><b>Atur siapa yang boleh melihat</b><span>Publik terlihat semua tamu. Privat buram sampai pemilik menyetujui.</span></div></div>
        <div class="ob-step"><div class="ob-num">3</div><div><b>Unggah dan lihat hasilnya</b><span>Foto langsung muncul di album. Boleh tambah pesan dan buat kolase.</span></div></div>
        <div class="ob-terms"><b>Ketentuan singkat</b>Unggah hanya foto dan video dari acara ini. Foto Privat hanya terbuka untuk tamu yang disetujui pemilik. Pemilik dapat menghapus foto yang tidak pantas.</div>
        <div class="ob-foot">Dengan melanjutkan, kamu menyetujui ketentuan di atas.</div>
        <button class="ob-btn" type="button">Mengerti, masuk ke album</button>
      </div>`;
    document.body.appendChild(ob);
    ob.querySelector('.ob-btn').addEventListener('click', () => {
      try { localStorage.setItem(KEY, '1'); } catch (e) { /* abaikan */ }
      ob.remove();
    });
  }

  // Tunggu album selesai dimuat dan layar sambutan (kalau ada) sudah ditutup
  function waitReady(done) {
    const t = setInterval(() => {
      const content = document.getElementById('content');
      if (content && !content.classList.contains('hidden') && !document.querySelector('.welcome')) { clearInterval(t); done(); }
    }, 250);
    setTimeout(() => clearInterval(t), 30000);
  }

  fetch('/api/a/' + m[1], { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((info) => { if (info && !info.is_owner) waitReady(show); })
    .catch(() => {});
})();
