# Catatan revisi (sesuai Peta Frame Digital Memory)

File BARU: db/notify.js, routes/notifications.js, public/js/notif.js
File DIUBAH: db/schema.sql, server.js, routes/guest.js, public/css/style.css,
public/js/{common,guest,owner-album,owner-dashboard}.js, public/guest/album.html,
public/owner/{album,dashboard}.html

Tidak perlu hapus database: tabel `notifications` dibuat otomatis (CREATE TABLE IF NOT EXISTS).

| Frame | Yang ditambahkan |
|---|---|
| O-13 / O-14 | Lonceng notifikasi + pusat notifikasi + banner permintaan akses baru (pemilik) |
| O-12 | Dialog "Hapus album ini?" dengan centang persetujuan, tombol Batal/Hapus |
| O-15 | Toast "Link album disalin" |
| T-01 | Layar sambutan tamu + tombol "Masuk ke album" |
| T-05 / T-06 | Banner "Akses disetujui" / "Akses ditolak" untuk tamu |
| T-07 | Banner "Unggahan ditutup", tombol Unggah nonaktif |
| T-09 / T-14 | Daftar progres unggah per file, tombol Batal dan Coba lagi |
