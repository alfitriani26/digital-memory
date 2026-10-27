// Bagian keamanan dan identitas:
// - batas paket (Basic / Premium)
// - hash password pemilik acara
// - sesi login pemilik acara (cookie dm_session)
// - pengenal tamu tanpa login (cookie dm_guest, dibuat otomatis)

const crypto = require('crypto');
const db = require('../db/database');

// Batas tiap paket. Pembayaran hanya simulasi untuk prototype.
const PLANS = {
  basic: { label: 'Basic', maxPhotos: 200, maxTemplates: 1, price: 'Gratis' },
  premium: { label: 'Premium', maxPhotos: 2000, maxTemplates: 5, price: 'Rp 99.000 (simulasi)' },
};

const SESSION_COOKIE = 'dm_session';
const GUEST_COOKIE = 'dm_guest';
const DAY = 24 * 60 * 60 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 14 * DAY });
}

function destroySession(req, res) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(SESSION_COOKIE);
}

// Mengisi req.user kalau pemilik acara sedang login (kalau tidak, req.user = null)
function loadOwner(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  req.user = null;
  if (token) {
    req.user =
      db
        .prepare(
          `SELECT u.id, u.name, u.email, u.plan
             FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ?`
        )
        .get(token) || null;
  }
  next();
}

function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Silakan login dulu.' });
  next();
}

// Memberi setiap pengunjung ID unik lewat cookie, supaya tamu bisa dikenali
// (misalnya melihat foto privat miliknya sendiri) tanpa harus login.
function ensureGuest(req, res, next) {
  let id = req.cookies[GUEST_COOKIE];
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    id = crypto.randomBytes(16).toString('hex');
    res.cookie(GUEST_COOKIE, id, { httpOnly: true, sameSite: 'lax', maxAge: 365 * DAY });
  }
  req.guestId = id;
  next();
}

module.exports = {
  PLANS,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  loadOwner,
  requireOwner,
  ensureGuest,
};