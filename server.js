// Titik masuk aplikasi Digital Memory.
// Jalankan dengan: npm start   (atau: npm run dev supaya otomatis restart saat file berubah)

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const os = require('os');

require('./db/database'); // membuka database dan membuat tabel kalau belum ada
const { loadOwner } = require('./middleware/auth');
const { router: mediaRouter } = require('./routes/media');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(loadOwner); // mengenali pemilik acara yang sedang login (req.user) di semua rute

// ---------- API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/albums', require('./routes/albums'));
app.use('/api/a', require('./routes/guest'));
app.use('/media', mediaRouter);

// Alamat /api/... yang tidak dikenal selalu dijawab JSON, bukan halaman HTML
app.use('/api', (req, res) => res.status(404).json({ error: 'Alamat API tidak ditemukan.' }));

// ---------- Halaman ----------
// Link di QR: /a/KODE  ->  halaman tamu (tanpa login)
app.get('/a/:code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'guest', 'album.html')));

// Pemilik acara yang sudah login langsung diarahkan dari halaman depan ke dashboard
app.get('/', (req, res, next) => {
  if (req.user) return res.redirect('/owner/dashboard.html');
  next();
});

app.use(express.static(PUBLIC_DIR));

// ---------- Penanganan error ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Digital Memory berjalan');
  console.log(`  Di komputer ini : http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Dari HP (Wi-Fi sama): http://${i.address}:${PORT}`);
    }
  }
  console.log('');
});