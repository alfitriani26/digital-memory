// Rute untuk pemilik acara: kelola album, template, foto, pesan, permintaan akses, dan kode QR.
// Semua rute di sini wajib login. Dipasang di server.js pada alamat /api/albums

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const QRCode = require('qrcode');
const db = require('../db/database');
const { PLANS, requireOwner } = require('../middleware/auth');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const THEME_KEYS = ['floral', 'y2k', 'cream', 'elegant']; // tema bawaan, digambar di layout.js
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa huruf/angka yang mirip
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.use(requireOwner);

// ---------- fungsi bantu ----------

function guestUrl(req, code) {
  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/a/${code}`;
}

function makeCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!db.prepare('SELECT 1 FROM albums WHERE code = ?').get(code)) return code;
  }
}

// Batas waktu tamu boleh mengunggah: tanggal acara (akhir hari, WIB) + sekian hari
function computeUploadUntil(eventDate, days) {
  let base = new Date();
  if (eventDate && DATE_RE.test(eventDate)) {
    const d = new Date(`${eventDate}T23:59:59+07:00`);
    if (!Number.isNaN(d.getTime())) base = d;
  }
  return new Date(base.getTime() + days * 86400000).toISOString();
}

function albumView(a, req) {
  return {
    ...a,
    upload_open: !a.upload_until || new Date(a.upload_until) > new Date(),
    guest_url: guestUrl(req, a.code),
  };
}

function removeFiles(albumId, names) {
  for (const name of names) {
    if (!name) continue;
    fs.rmSync(path.join(UPLOADS_DIR, String(albumId), name), { force: true });
  }
}

function photoView(p) {
  return {
    id: p.id,
    guest_name: p.guest_name,
    media_type: p.media_type,
    visibility: p.visibility,
    allow_template: p.allow_template,
    created_at: p.created_at,
    thumb_url: p.media_type === 'image' ? `/media/${p.id}/thumb` : null,
    view_url: `/media/${p.id}/view`,
    download_url: `/media/${p.id}/original`,
  };
}

// Setiap rute yang memakai :id otomatis memastikan album itu milik pemilik yang login
router.param('id', (req, res, next, id) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ? AND user_id = ?').get(Number(id), req.user.id);
  if (!album) return res.status(404).json({ error: 'Album tidak ditemukan.' });
  req.album = album;
  next();
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

function receiveImage(field) {
  return (req, res, next) => {
    imageUpload.single(field)(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Gambar maksimal 8 MB.' : 'Gagal membaca file gambar.';
        return res.status(400).json({ error: msg });
      }
      next();
    });
  };
}

// ---------- album ----------

// Daftar album milik pemilik, lengkap dengan angka ringkasan
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*,
         (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count,
         (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id AND p.visibility = 'private') AS private_count,
         (SELECT COUNT(*) FROM access_requests r WHERE r.album_id = a.id AND r.status = 'pending') AS pending_requests,
         (SELECT COUNT(*) FROM messages m WHERE m.album_id = a.id) AS message_count
       FROM albums a WHERE a.user_id = ? ORDER BY a.created_at DESC, a.id DESC`
    )
    .all(req.user.id);
  res.json(rows.map((a) => albumView(a, req)));
});

// Buat album baru
router.post('/', (req, res) => {
  const title = String(req.body.title || '').trim();
  const eventDate = String(req.body.event_date || '').trim() || null;
  const description = String(req.body.description || '').trim().slice(0, 300);
  const themeColor = HEX_RE.test(req.body.theme_color) ? req.body.theme_color : '#E8A0B4';
  let days = Number(req.body.upload_days);
  if (!Number.isFinite(days)) days = 3;
  days = Math.min(Math.max(Math.round(days), 1), 30);
  const defaultPrivate = req.body.default_private === true || req.body.default_private === '1' ? 1 : 0;

  if (!title || title.length > 100) return res.status(400).json({ error: 'Nama acara wajib diisi (maksimal 100 huruf).' });
  if (eventDate && !DATE_RE.test(eventDate)) return res.status(400).json({ error: 'Format tanggal acara belum benar.' });

  const result = db
    .prepare(
      `INSERT INTO albums (user_id, title, event_date, description, code, theme_color, upload_until, default_private)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, title, eventDate, description, makeCode(), themeColor, computeUploadUntil(eventDate, days), defaultPrivate);

  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(albumView(album, req));
});

// Detail satu album
router.get('/:id', (req, res) => {
  const a = req.album;
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM photos WHERE album_id = @id) AS photo_count,
         (SELECT COUNT(*) FROM photos WHERE album_id = @id AND visibility = 'private') AS private_count,
         (SELECT COUNT(*) FROM access_requests WHERE album_id = @id AND status = 'pending') AS pending_requests,
         (SELECT COUNT(*) FROM messages WHERE album_id = @id) AS message_count`
    )
    .get({ id: a.id });
  const plan = PLANS[req.user.plan];
  res.json({ ...albumView(a, req), ...counts, plan: req.user.plan, planInfo: plan });
});

// Ubah pengaturan album
router.patch('/:id', (req, res) => {
  const a = req.album;
  const b = req.body;

  const title = b.title !== undefined ? String(b.title).trim() : a.title;
  const description = b.description !== undefined ? String(b.description).trim().slice(0, 300) : a.description;
  const eventDate = b.event_date !== undefined ? String(b.event_date).trim() || null : a.event_date;
  const themeColor = b.theme_color !== undefined && HEX_RE.test(b.theme_color) ? b.theme_color : a.theme_color;
  const defaultPrivate = b.default_private !== undefined ? (b.default_private ? 1 : 0) : a.default_private;

  if (!title || title.length > 100) return res.status(400).json({ error: 'Nama acara wajib diisi (maksimal 100 huruf).' });
  if (eventDate && !DATE_RE.test(eventDate)) return res.status(400).json({ error: 'Format tanggal acara belum benar.' });

  // upload_days_from_now: 0 = tutup unggahan sekarang, angka lain = buka sampai N hari dari sekarang
  let uploadUntil = a.upload_until;
  if (b.upload_days_from_now !== undefined) {
    const d = Math.min(Math.max(Math.round(Number(b.upload_days_from_now)), 0), 365);
    if (!Number.isFinite(d)) return res.status(400).json({ error: 'Durasi unggahan tidak valid.' });
    uploadUntil = new Date(Date.now() + d * 86400000).toISOString();
  }

  db.prepare(
    `UPDATE albums SET title = ?, description = ?, event_date = ?, theme_color = ?,
            default_private = ?, upload_until = ? WHERE id = ?`
  ).run(title, description, eventDate, themeColor, defaultPrivate, uploadUntil, a.id);

  res.json(albumView(db.prepare('SELECT * FROM albums WHERE id = ?').get(a.id), req));
});

// Hapus album beserta semua fotonya
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM albums WHERE id = ?').run(req.album.id);
  fs.rmSync(path.join(UPLOADS_DIR, String(req.album.id)), { recursive: true, force: true });
  res.json({ ok: true });
});

// Gambar kode QR yang mengarah ke halaman tamu
router.get('/:id/qr.png', async (req, res) => {
  try {
    const buf = await QRCode.toBuffer(guestUrl(req, req.album.code), {
      width: 640,
      margin: 2,
      color: { dark: '#2d2a26', light: '#ffffff' },
    });
    res.type('png');
    if (req.query.download) {
      res.setHeader('Content-Disposition', `attachment; filename="qr-${req.album.code}.png"`);
    }
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Gagal membuat kode QR.' });
  }
});

// ---------- foto ----------

// Pemilik album melihat semua foto (publik dan privat) dalam keadaan jernih
router.get('/:id/photos', (req, res) => {
  const rows = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY created_at DESC, id DESC').all(req.album.id);
  res.json(rows.map(photoView));
});

router.delete('/:id/photos/:photoId', (req, res) => {
  const p = db.prepare('SELECT * FROM photos WHERE id = ? AND album_id = ?').get(Number(req.params.photoId), req.album.id);
  if (!p) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
  removeFiles(req.album.id, [p.filename, p.thumb_filename, p.view_filename, p.blur_filename]);
  res.json({ ok: true });
});

// ---------- pesan dan kesan ----------

router.get('/:id/messages', (req, res) => {
  const rows = db.prepare('SELECT * FROM messages WHERE album_id = ? ORDER BY created_at DESC, id DESC').all(req.album.id);
  res.json(
    rows.map((m) => ({
      id: m.id,
      guest_name: m.guest_name,
      text: m.text,
      created_at: m.created_at,
      audio_url: m.audio_filename ? `/media/message/${m.id}/audio` : null,
      photo_thumb_url: m.photo_id ? `/media/${m.photo_id}/thumb` : null,
    }))
  );
});

router.delete('/:id/messages/:mid', (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ? AND album_id = ?').get(Number(req.params.mid), req.album.id);
  if (!m) return res.status(404).json({ error: 'Pesan tidak ditemukan.' });
  db.prepare('DELETE FROM messages WHERE id = ?').run(m.id);
  removeFiles(req.album.id, [m.audio_filename]);
  res.json({ ok: true });
});

// ---------- permintaan akses foto privat ----------

router.get('/:id/requests', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.status, r.guest_name, r.created_at, r.photo_id,
              p.guest_name AS uploader_name, p.media_type
         FROM access_requests r JOIN photos p ON p.id = r.photo_id
        WHERE r.album_id = ?
        ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC`
    )
    .all(req.album.id);
  res.json(rows.map((r) => ({ ...r, thumb_url: r.media_type === 'image' ? `/media/${r.photo_id}/thumb` : null })));
});

// Setujui atau tolak semua permintaan yang masih menunggu (harus ditulis sebelum rute :rid)
router.post('/:id/requests/bulk', (req, res) => {
  const status = { approve: 'approved', reject: 'rejected' }[req.body.action];
  if (!status) return res.status(400).json({ error: 'Aksi tidak dikenal.' });
  const info = db
    .prepare("UPDATE access_requests SET status = ? WHERE album_id = ? AND status = 'pending'")
    .run(status, req.album.id);
  res.json({ ok: true, changed: info.changes });
});

router.post('/:id/requests/:rid', (req, res) => {
  const status = { approve: 'approved', reject: 'rejected' }[req.body.action];
  if (!status) return res.status(400).json({ error: 'Aksi tidak dikenal.' });
  const info = db
    .prepare('UPDATE access_requests SET status = ? WHERE id = ? AND album_id = ?')
    .run(status, Number(req.params.rid), req.album.id);
  if (!info.changes) return res.status(404).json({ error: 'Permintaan tidak ditemukan.' });
  res.json({ ok: true });
});

// ---------- template ----------

function templateView(t) {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    theme_key: t.theme_key,
    caption: t.caption,
    image_url: t.kind === 'image' ? `/media/template/${t.id}` : null,
  };
}

router.get('/:id/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM templates WHERE album_id = ? ORDER BY id').all(req.album.id);
  res.json({
    templates: rows.map(templateView),
    limit: PLANS[req.user.plan].maxTemplates,
    themeKeys: THEME_KEYS,
  });
});

router.post('/:id/templates', receiveImage('image'), async (req, res) => {
  try {
    const limit = PLANS[req.user.plan].maxTemplates;
    const used = db.prepare('SELECT COUNT(*) AS n FROM templates WHERE album_id = ?').get(req.album.id).n;
    if (used >= limit) {
      return res.status(403).json({ error: `Paket ${PLANS[req.user.plan].label} hanya boleh ${limit} template. Upgrade ke Premium untuk menambah.` });
    }

    const name = String(req.body.name || '').trim();
    const caption = String(req.body.caption || '').trim().slice(0, 80);
    const kind = req.body.kind === 'image' ? 'image' : 'theme';
    const themeKey = String(req.body.theme_key || '');

    if (!name || name.length > 40) return res.status(400).json({ error: 'Nama template wajib diisi (maksimal 40 huruf).' });

    let filename = null;
    if (kind === 'theme') {
      if (!THEME_KEYS.includes(themeKey)) return res.status(400).json({ error: 'Pilih salah satu tema bawaan.' });
    } else {
      if (!req.file) return res.status(400).json({ error: 'Pilih gambar background terlebih dahulu.' });
      const dir = path.join(UPLOADS_DIR, String(req.album.id));
      fs.mkdirSync(dir, { recursive: true });
      filename = `tpl_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`;
      await sharp(req.file.buffer)
        .rotate()
        .resize(1080, 1350, { fit: 'cover' })
        .jpeg({ quality: 88 })
        .toFile(path.join(dir, filename));
    }

    const result = db
      .prepare('INSERT INTO templates (album_id, name, kind, theme_key, filename, caption) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.album.id, name, kind, kind === 'theme' ? themeKey : null, filename, caption || null);
    res.status(201).json(templateView(db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid)));
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Gambar tidak bisa diproses. Coba file JPG atau PNG lain.' });
  }
});

router.delete('/:id/templates/:tid', (req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE id = ? AND album_id = ?').get(Number(req.params.tid), req.album.id);
  if (!t) return res.status(404).json({ error: 'Template tidak ditemukan.' });
  db.prepare('DELETE FROM templates WHERE id = ?').run(t.id);
  removeFiles(req.album.id, [t.filename]);
  res.json({ ok: true });
});

module.exports = router;