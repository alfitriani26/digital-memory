# Digital Memory

Prototype web album acara: tamu scan QR, unggah foto/video tanpa login, pilih publik atau privat,
dan pemilik acara mengelola album, permintaan akses, dan template.

## Cara menjalankan

Kebutuhan: Node.js 20 atau lebih baru.

```
npm install
npm run seed     # data contoh (sekali saja, boleh diulang)
npm start        # buka http://localhost:3000
```

Di Windows PowerShell yang memblokir skrip, pakai `npm.cmd` sebagai ganti `npm`.

## Akun dan album contoh

- Login pemilik: `demo@digitalmemory.test` / `demo1234` (paket Premium)
- Album tamu: `http://localhost:3000/a/DEMO01`

## Struktur folder

```
digitalmemory/
├─ server.js            titik masuk aplikasi
├─ seed.js              data contoh
├─ package.json
├─ db/                  database.js (koneksi SQLite) + schema.sql (tabel)
├─ middleware/auth.js   paket, password, sesi pemilik, ID tamu
├─ routes/              auth.js, albums.js, guest.js, media.js
├─ public/              halaman web (HTML, CSS, JS)
├─ data/                file database (dibuat otomatis)
└─ uploads/             foto dan video (dibuat otomatis)
```

## Catatan

- Foto privat diburamkan di server, bukan hanya di tampilan, jadi tidak bisa dibuka lewat inspect element.
- Pembayaran paket Premium hanya simulasi.
- Kalau struktur tabel di `db/schema.sql` diubah, hapus `data/digital-memory.db` lalu jalankan `npm run seed` lagi.
- Kamera langsung di HP butuh HTTPS atau localhost. Lewat alamat Wi-Fi biasa, tombol akan memakai kamera bawaan HP.
- Untuk QR yang menunjuk ke alamat lain (misalnya saat demo di jaringan), set `BASE_URL`, contoh: `BASE_URL=http://192.168.1.5:3000 npm start`.