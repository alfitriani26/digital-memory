// Mengisi data contoh supaya aplikasi langsung bisa dicoba.
// Jalankan: npm run seed
//
// Hasilnya:
//   - akun pemilik  : demo@digitalmemory.test / demo1234 (paket Premium)
//   - album contoh  : kode DEMO01  ->  buka http://localhost:3000/a/DEMO01
//   - 8 foto contoh (sebagian publik, sebagian privat), pesan, dan 1 permintaan akses
// Menjalankan seed berulang kali aman: data demo lama dihapus dulu.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('./db/database');
const { hashPassword } = require('./middleware/auth');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const EMAIL = 'demo@digitalmemory.test';
const PASSWORD = 'demo1234';
const CODE = 'DEMO01';

// Gambar contoh dibuat dari SVG (gradasi warna + tulisan), jadi tidak perlu file foto apa pun
function sampleSvg(label, c1, c2) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="930" cy="250" r="140" fill="#ffffff" opacity="0.25"/>
    <circle cx="260" cy="700" r="190" fill="#ffffff" opacity="0.18"/>
    <text x="600" y="470" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="bold"
          fill="#ffffff" text-anchor="middle">${label}</text>
    <text x="600" y="550" font-family="Arial, Helvetica, sans-serif" font-size="38"
          fill="#ffffff" opacity="0.9" text-anchor="middle">Foto contoh Digital Memory</text>
  </svg>`);
}

async function makeImageFiles(dir, base, svg) {
  const pic = () => sharp(svg);
  const files = { filename: `${base}.jpg`, view: `${base}_v.jpg`, thumb: `${base}_t.jpg`, blur: `${base}_b.jpg` };
  await pic().jpeg({ quality: 90 }).toFile(path.join(dir, files.filename));
  await pic().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(dir, files.view));
  await pic().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(dir, files.thumb));
  const tiny = await pic().resize({ width: 28, height: 28, fit: 'inside' }).jpeg({ quality: 60 }).toBuffer();
  await sharp(tiny).resize({ width: 600, height: 600, fit: 'inside' }).blur(6).jpeg({ quality: 70 }).toFile(path.join(dir, files.blur));
  return files;
}

const guestId = () => crypto.randomBytes(16).toString('hex');

async function main() {
  // 1. Hapus data demo lama (album, foto, pesan ikut terhapus otomatis)
  const old = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
  if (old) {
    for (const a of db.prepare('SELECT id FROM albums WHERE user_id = ?').all(old.id)) {
      fs.rmSync(path.join(UPLOADS_DIR, String(a.id)), { recursive: true, force: true });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(old.id);
  }
  db.prepare('DELETE FROM albums WHERE code = ?').run(CODE);

  // 2. Akun pemilik
  const { hash, salt } = hashPassword(PASSWORD);
  const userId = db
    .prepare("INSERT INTO users (name, email, password_hash, salt, plan) VALUES ('Raka & Sinta', ?, ?, ?, 'premium')")
    .run(EMAIL, hash, salt).lastInsertRowid;

  // 3. Album contoh: unggahan tamu dibuka sampai 7 hari ke depan
  const today = new Date();
  const eventDate = today.toISOString().slice(0, 10);
  const until = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const albumId = db
    .prepare(
      `INSERT INTO albums (user_id, title, event_date, description, code, theme_color, upload_until, default_private)
       VALUES (?, 'Pernikahan Raka & Sinta', ?, 'Terima kasih sudah hadir! Unggah foto dan tulis kesanmu di sini.', ?, '#E8A0B4', ?, 0)`
    )
    .run(userId, eventDate, CODE, until).lastInsertRowid;

  const dir = path.join(UPLOADS_DIR, String(albumId));
  fs.mkdirSync(dir, { recursive: true });

  // 4. Foto contoh: [label, warna1, warna2, nama tamu, visibility, boleh dipakai template]
  const samples = [
    ['Akad Nikah', '#E8A0B4', '#F6D5DE', 'Dina', 'public', 1],
    ['Foto Keluarga', '#7FB5B5', '#CFE8E3', 'Budi', 'public', 1],
    ['Meja Dessert', '#F2B880', '#FBE3C8', 'Maya', 'public', 0],
    ['Pelaminan', '#B39DDB', '#E4DAF5', 'Rani', 'public', 1],
    ['Candid Tamu', '#90CAF9', '#D7ECFC', 'Eko', 'private', 0],
    ['Momen Lempar Bunga', '#F48FB1', '#FCD9E5', 'Tika', 'private', 0],
    ['Selfie Sahabat', '#A5D6A7', '#DDF1DE', 'Fajar', 'public', 1],
    ['Dansa Pertama', '#FFCC80', '#FFEBCC', 'Nadia', 'private', 0],
  ];

  const insertPhoto = db.prepare(
    `INSERT INTO photos (album_id, guest_id, guest_name, media_type, filename, thumb_filename, view_filename,
                         blur_filename, original_name, visibility, allow_template)
     VALUES (?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, ?)`
  );
  const photoIds = [];
  for (let i = 0; i < samples.length; i++) {
    const [label, c1, c2, name, vis, allow] = samples[i];
    const base = `demo_${i + 1}`;
    const f = await makeImageFiles(dir, base, sampleSvg(label, c1, c2));
    const id = insertPhoto.run(albumId, guestId(), name, f.filename, f.thumb, f.view, f.blur, `${label}.jpg`, vis, allow).lastInsertRowid;
    photoIds.push({ id, name });
  }

  // 5. Pesan dan kesan (selalu publik)
  const insertMsg = db.prepare('INSERT INTO messages (album_id, photo_id, guest_id, guest_name, text) VALUES (?, ?, ?, ?, ?)');
  insertMsg.run(albumId, photoIds[0].id, guestId(), 'Dina', 'Selamat menempuh hidup baru! Semoga sakinah, mawaddah, warahmah.');
  insertMsg.run(albumId, null, guestId(), 'Pak Hendra', 'Acaranya hangat sekali. Bahagia selalu untuk kalian berdua.');
  insertMsg.run(albumId, photoIds[4].id, guestId(), 'Eko', 'Foto candid ini favoritku, semoga kalian suka juga.');

  // 6. Satu permintaan akses yang menunggu persetujuan (muncul di halaman pemilik)
  db.prepare('INSERT INTO access_requests (photo_id, album_id, guest_id, guest_name) VALUES (?, ?, ?, ?)')
    .run(photoIds[5].id, albumId, guestId(), 'Sari');

  console.log('\n  Data contoh berhasil dibuat.\n');
  console.log(`  Login pemilik : ${EMAIL}`);
  console.log(`  Password      : ${PASSWORD}`);
  console.log(`  Halaman tamu  : http://localhost:3000/a/${CODE}\n`);
}

main().catch((e) => {
  console.error('Seed gagal:', e);
  process.exit(1);
});