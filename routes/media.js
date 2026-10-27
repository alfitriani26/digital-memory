// Penyaji foto, video, template, dan suara. Di sinilah aturan privasi dijaga:
// foto privat dikirim dalam versi BURAM kepada siapa pun yang tidak berhak melihatnya.
// Dipasang di server.js pada alamat /media

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { loadOwner, ensureGuest } = require('../middleware/auth');

const router = express.Router();
router.use(loadOwner);
router.use(ensureGuest);

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// ---------- aturan akses (juga dipakai oleh routes/guest.js) ----------
//
// Boleh MELIHAT jernih : foto publik, pemilik album, pengupload, atau tamu yang permintaannya disetujui.
// Boleh MEMAKAI/UNDUH   : pemilik album, pengupload, atau (foto publik yang diizinkan pengupload untuk template).

function accessResolver(req, album) {
  const isOwner = !!(req.user && album.user_id === req.user.id);
  const rows = db
    .prepare('SELECT photo_id, status FROM access_requests WHERE album_id = ? AND guest_id = ?')
    .all(album.id, req.guestId);
  const statusByPhoto = new Map(rows.map((r) => [r.photo_id, r.status]));

  return (photo) => {
    const isUploader = photo.guest_id === req.guestId;
    const requestStatus = statusByPhoto.get(photo.id) || null;
    const canView = photo.visibility === 'public' || isOwner || isUploader || requestStatus === 'approved';
    const canUse = isOwner || isUploader || (photo.visibility === 'public' && photo.allow_template === 1);
    return { isOwner, isUploader, requestStatus, canView, canUse };
  };
}

// ---------- fungsi bantu ----------

function filePath(albumId, filename) {
  return path.join(UPLOADS_DIR, String(albumId), filename);
}

function sendPlaceholder(res, kind) {
  const icon =
    kind === 'lock'
      ? `<rect x="230" y="270" width="140" height="110" rx="14" fill="#9a8f88"/>
         <path d="M255 270v-40a45 45 0 0190 0v40" fill="none" stroke="#9a8f88" stroke-width="22"/>`
      : `<circle cx="300" cy="300" r="90" fill="#9a8f88"/><path d="M272 250l85 50-85 50z" fill="#f3ece6"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="#e9e0d9"/>${icon}</svg>`;
  res.setHeader('Cache-Control', 'no-store');
  res.type('image/svg+xml').send(svg);
}

function safeName(name, fallback) {
  const cleaned = String(name || '').replace(/[^\w.\- ]/g, '_').slice(0, 80);
  return cleaned || fallback;
}

// ---------- template (gambar background buatan pemilik, boleh dilihat tamu) ----------

router.get('/template/:tid(\\d+)', (req, res) => {
  const t = db.prepare("SELECT * FROM templates WHERE id = ? AND kind = 'image'").get(Number(req.params.tid));
  if (!t || !t.filename) return res.status(404).end();
  const p = filePath(t.album_id, t.filename);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(p);
});

// ---------- suara pesan (pesan dan kesan selalu publik) ----------

router.get('/message/:mid(\\d+)/audio', (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.mid));
  if (!m || !m.audio_filename) return res.status(404).end();
  const p = filePath(m.album_id, m.audio_filename);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(p);
});

// ---------- foto dan video ----------
// Varian: thumb (kecil), view (ukuran layar), original (file asli untuk diunduh)

router.get('/:id(\\d+)/:variant(thumb|view|original)', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(req.params.id));
  if (!photo) return res.status(404).end();
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(photo.album_id);
  const access = accessResolver(req, album)(photo);
  const variant = req.params.variant;
  const isVideo = photo.media_type === 'video';

  // Unduh file asli, atau pakai di template (?use=1): hanya yang berhak
  if (variant === 'original' || (variant === 'view' && req.query.use)) {
    if (!access.canUse) {
      return res.status(403).json({ error: 'Foto ini tidak diizinkan untuk dipakai atau diunduh.' });
    }
  }

  // Foto yang tidak boleh dilihat: kirim versi buram (atau gembok untuk video)
  if (!access.canView) {
    if (isVideo || !photo.blur_filename || !fs.existsSync(filePath(album.id, photo.blur_filename))) {
      return sendPlaceholder(res, 'lock');
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(filePath(album.id, photo.blur_filename));
  }

  if (isVideo) {
    if (variant === 'thumb') return sendPlaceholder(res, 'video');
    const p = filePath(album.id, photo.filename);
    if (!fs.existsSync(p)) return res.status(404).end();
    if (variant === 'original') return res.download(p, safeName(photo.original_name, `video-${photo.id}.mp4`));
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.sendFile(p); // sendFile mendukung Range, jadi video bisa di-seek
  }

  // Gambar
  let name = photo.filename;
  if (variant === 'thumb') name = photo.thumb_filename || photo.filename;
  if (variant === 'view') name = photo.view_filename || photo.filename;
  const p = filePath(album.id, name);
  if (!fs.existsSync(p)) return res.status(404).end();

  if (variant === 'original') {
    return res.download(p, safeName(photo.original_name, `foto-${photo.id}${path.extname(photo.filename)}`));
  }
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.sendFile(p);
});

module.exports = { router, accessResolver };