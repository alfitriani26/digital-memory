// Rute akun pemilik acara: daftar, login, logout, info akun, dan ganti paket.
// Dipasang di server.js pada alamat /api/auth

const express = require('express');
const db = require('../db/database');
const {
  PLANS,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireOwner,
} = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function accountInfo(user) {
  const plan = PLANS[user.plan];
  const usage = db
    .prepare(
      `SELECT COUNT(DISTINCT a.id) AS albums, COUNT(p.id) AS photos
         FROM albums a LEFT JOIN photos p ON p.album_id = a.id
        WHERE a.user_id = ?`
    )
    .get(user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    planInfo: plan,
    usage,
  };
}

// Daftar akun baru
router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name || name.length > 80) return res.status(400).json({ error: 'Nama wajib diisi (maksimal 80 huruf).' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Format email belum benar.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email ini sudah terdaftar. Silakan login.' });

  const { hash, salt } = hashPassword(password);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)')
    .run(name, email, hash, salt);

  createSession(res, result.lastInsertRowid);
  const user = db.prepare('SELECT id, name, email, plan FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(accountInfo(user));
});

// Login
router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }

  createSession(res, row.id);
  res.json(accountInfo(row));
});

// Logout
router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

// Info akun yang sedang login (dipakai halaman dashboard)
router.get('/me', requireOwner, (req, res) => {
  res.json(accountInfo(req.user));
});

// Ganti paket. Pembayaran hanya simulasi untuk prototype.
router.post('/upgrade', requireOwner, (req, res) => {
  const plan = String(req.body.plan || '');
  if (!PLANS[plan]) return res.status(400).json({ error: 'Paket tidak dikenal.' });

  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, req.user.id);
  const user = db.prepare('SELECT id, name, email, plan FROM users WHERE id = ?').get(req.user.id);
  res.json(accountInfo(user));
});

module.exports = router;