// Membuat notifikasi untuk pemilik album. Dipanggil dari rute tamu.
const db = require('./database');

function notifyOwner(albumId, type, text) {
  try {
    const album = db.prepare('SELECT user_id FROM albums WHERE id = ?').get(albumId);
    if (!album) return;
    // Gabungkan notifikasi sejenis yang belum dibaca (maks 1 per 2 menit) supaya tidak membanjiri
    if (type === 'photo' || type === 'message') {
      const last = db
        .prepare(`SELECT id FROM notifications WHERE album_id = ? AND type = ? AND read_at IS NULL AND created_at > datetime('now', '-2 minutes') ORDER BY id DESC LIMIT 1`)
        .get(albumId, type);
      if (last) return;
    }
    db.prepare('INSERT INTO notifications (user_id, album_id, type, text) VALUES (?, ?, ?, ?)').run(album.user_id, albumId, type, text);
  } catch (e) {
    console.error('notifikasi gagal dibuat', e.message);
  }
}

module.exports = { notifyOwner };
