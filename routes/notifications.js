// Pusat notifikasi pemilik acara. Dipasang di server.js pada alamat /api/notifications
const express = require('express');
const db = require('../db/database');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(requireOwner);

// Peringatan "unggahan segera ditutup": dibuat sekali per album saat tersisa < 24 jam
function ensureClosingNotices(userId) {
  const albums = db
    .prepare(`SELECT id, title FROM albums WHERE user_id = ? AND upload_until IS NOT NULL
              AND upload_until > datetime('now') AND upload_until < datetime('now', '+1 day')`)
    .all(userId);
  for (const a of albums) {
    const exists = db.prepare(`SELECT 1 FROM notifications WHERE album_id = ? AND type = 'closing' AND created_at > datetime('now', '-1 day')`).get(a.id);
    if (!exists) {
      db.prepare('INSERT INTO notifications (user_id, album_id, type, text) VALUES (?, ?, ?, ?)')
        .run(userId, a.id, 'closing', `Waktu unggah album "${a.title}" akan berakhir dalam 24 jam.`);
    }
  }
}

router.get('/', (req, res) => {
  ensureClosingNotices(req.user.id);
  const items = db
    .prepare(`SELECT n.id, n.album_id, n.type, n.text, n.read_at, n.created_at, a.title AS album_title
              FROM notifications n JOIN albums a ON a.id = n.album_id
              WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 40`)
    .all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).c;
  res.json({ unread, items });
});

router.post('/read-all', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`).run(req.user.id);
  res.json({ ok: true });
});

router.post('/:id/read', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`).run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
