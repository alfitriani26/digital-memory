// Rute untuk tamu (TANPA login): buka album lewat kode QR, unggah foto/video,
// kirim pesan dan kesan, minta akses foto privat, dan atur foto miliknya sendiri.
// Dipasang di server.js pada alamat /api/a

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db/database');
const { PLANS, loadOwner, ensureGuest } = require('../middleware/auth');
const { accessResolver } = require('./media');

const router = express.Router();
router.use(loadOwner);
router.use(ensureGuest);

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;
const MAX_AUDIO = 5 * 1024 * 1024;

const VIDEO_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const AUDIO_EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a' };
const KEEP_IMAGE_EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' }; // format lain diubah ke JPG

// ---------- fungsi bantu ----------

function uploadOpen(album, req) {
  const isOwner = !!(req.user && album.user_id === req.user.id);
  return isOwner || !album.upload_until || new Date(album.upload_until) > new Date();
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 40) || 'Tamu';
}

function isTrue(v) {
  return v === true || v === '1' || v === 'true' || v === 'on';
}

function removeFiles(albumId, names) {
  for (const name of names) {
    if (name) fs.rmSync(path.join(UPLOADS_DIR, String(albumId), name), { force: true });
  }
}

function photoView(p, acc) {
  const v = `${p.visibility}-${acc.canView ? 1 : 0}`; // penanda supaya browser tidak memakai gambar lama
  return {
    id: p.id,
    guest_name: p.guest_name,
    media_type: p.media_type,
    visibility: p.visibility,
    allow_template: p.allow_template,
    created_at: p.created_at,
    is_mine: acc.isUploader,
    can_view: acc.canView,
    can_use: acc.canUse,
    request_status: acc.requestStatus,
    thumb_url: `/media/${p.id}/thumb?v=${v}`,
    view_url: `/media/${p.id}/view?v=${v}`,
    use_url: acc.canUse && p.media_type === 'image' ? `/media/${p.id}/view?use=1` : null,
    download_url: acc.canUse ? `/media/${p.id}/original` : null,
  };
}

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

// Membuat file turunan gambar: asli, ukuran layar, thumbnail, dan versi BURAM untuk foto privat
async function processImage(buffer, dir, base) {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('bukan gambar');

  const ext = KEEP_IMAGE_EXT[meta.format];
  const original = `${base}.${ext || 'jpg'}`;
  if (ext && !(meta.pages > 1)) {
    await fs.promises.writeFile(path.join(dir, original), buffer);
  } else {
    await sharp(buffer).rotate().jpeg({ quality: 92 }).toFile(path.join(dir, original));
  }

  const files = { filename: original, view: `${base}_v.jpg`, thumb: `${base}_t.jpg`, blur: `${base}_b.jpg` };
  const pic = () => sharp(buffer).rotate();

  await pic().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(dir, files.view));
  await pic().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(dir, files.thumb));

  // Buram permanen: dikecilkan sangat kecil dulu (detail hilang), baru diperbesar dan diburamkan
  const tiny = await pic().resize({ width: 28, height: 28, fit: 'inside' }).jpeg({ quality: 60 }).toBuffer();
  await sharp(tiny).resize({ width: 600, height: 600, fit: 'inside' }).blur(6).jpeg({ quality: 70 }).toFile(path.join(dir, files.blur));
  return files;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO, files: 2 },
});
const receive = upload.fields([
  { name: 'media', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

function receiveFiles(req, res, next) {
  receive(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File terlalu besar (video maksimal 60 MB).' : 'Gagal membaca file yang dikirim.';
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

// Simpan suara pesan (kalau ada), mengembalikan nama file atau null
function saveAudio(file, dir) {
  if (!file) return null;
  const ext = AUDIO_EXT[String(file.mimetype).split(';')[0]];
  if (!ext || file.size > MAX_AUDIO) return false;
  fs.mkdirSync(dir, { recursive: true });
  const name = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return name;
}

// Setiap rute dengan :code otomatis memuat album dari kode QR
router.param('code', (req, res, next, code) => {
  const album = db.prepare('SELECT * FROM albums WHERE code = ?').get(String(code).toUpperCase());
  if (!album) return res.status(404).json({ error: 'Album tidak ditemukan. Cek kembali kode QR-nya.' });
  req.album = album;
  next();
});

// ---------- info album ----------

router.get('/:code', (req, res) => {
  const a = req.album;
  const templates = db.prepare('SELECT * FROM templates WHERE album_id = ? ORDER BY id').all(a.id);
  res.json({
    code: a.code,
    title: a.title,
    event_date: a.event_date,
    description: a.description,
    theme_color: a.theme_color,
    upload_until: a.upload_until,
    upload_open: !a.upload_until || new Date(a.upload_until) > new Date(),
    default_private: a.default_private,
    is_owner: !!(req.user && req.user.id === a.user_id),
    templates: templates.map(templateView),
  });
});

// ---------- foto ----------

router.get('/:code/photos', (req, res) => {
  const resolve = accessResolver(req, req.album);
  const rows = db.prepare('SELECT * FROM photos WHERE album_id = ? ORDER BY created_at DESC, id DESC').all(req.album.id);
  res.json(rows.map((p) => photoView(p, resolve(p))));
});

router.post('/:code/photos', receiveFiles, async (req, res) => {
  const album = req.album;
  const media = req.files && req.files.media && req.files.media[0];
  const audio = req.files && req.files.audio && req.files.audio[0];
  const written = [];
  const dir = path.join(UPLOADS_DIR, String(album.id));

  try {
    if (!uploadOpen(album, req)) return res.status(403).json({ error: 'Waktu unggah untuk album ini sudah ditutup. Kamu masih bisa melihat foto-fotonya.' });
    if (!media) return res.status(400).json({ error: 'Pilih foto atau video terlebih dahulu.' });

    const owner = db.prepare('SELECT plan FROM users WHERE id = ?').get(album.user_id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE album_id = ?').get(album.id).n;
    if (count >= PLANS[owner.plan].maxPhotos) return res.status(403).json({ error: 'Kapasitas album sudah penuh. Hubungi pemilik acara.' });

    const visibility = req.body.visibility === 'private' ? 'private' : req.body.visibility === 'public' ? 'public' : album.default_private ? 'private' : 'public';
    const allowTemplate = visibility === 'public' && isTrue(req.body.allow_template) ? 1 : 0;
    const guestName = cleanName(req.body.guest_name);
    const text = String(req.body.text || '').trim().slice(0, 300);

    fs.mkdirSync(dir, { recursive: true });
    const base = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const mime = String(media.mimetype).split(';')[0];
    let row;

    if (mime.startsWith('image/')) {
      if (media.size > MAX_IMAGE) return res.status(400).json({ error: 'Ukuran foto maksimal 15 MB.' });
      let files;
      try {
        files = await processImage(media.buffer, dir, base);
      } catch (e) {
        return res.status(400).json({ error: 'File ini bukan gambar yang valid (coba JPG atau PNG).' });
      }
      written.push(files.filename, files.view, files.thumb, files.blur);
      row = { type: 'image', filename: files.filename, thumb: files.thumb, view: files.view, blur: files.blur };
    } else if (VIDEO_EXT[mime]) {
      const filename = `${base}.${VIDEO_EXT[mime]}`;
      fs.writeFileSync(path.join(dir, filename), media.buffer);
      written.push(filename);
      row = { type: 'video', filename, thumb: null, view: null, blur: null };
    } else {
      return res.status(400).json({ error: 'Format file belum didukung. Gunakan foto (JPG/PNG/WebP) atau video (MP4/WebM/MOV).' });
    }

    const result = db
      .prepare(
        `INSERT INTO photos (album_id, guest_id, guest_name, media_type, filename, thumb_filename, view_filename,
                             blur_filename, original_name, visibility, allow_template)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(album.id, req.guestId, guestName, row.type, row.filename, row.thumb, row.view, row.blur,
           String(media.originalname || '').slice(0, 120), visibility, allowTemplate);
    const photoId = result.lastInsertRowid;

    // Pesan/kesan (teks dan/atau suara) yang ikut dikirim bersama foto
    const audioName = saveAudio(audio, dir);
    if (audioName) written.push(audioName);
    if (text || audioName) {
      db.prepare('INSERT INTO messages (album_id, photo_id, guest_id, guest_name, text, audio_filename) VALUES (?, ?, ?, ?, ?, ?)')
        .run(album.id, photoId, req.guestId, guestName, text || null, audioName || null);
    }

    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
    res.status(201).json(photoView(photo, accessResolver(req, album)(photo)));
  } catch (e) {
    console.error(e);
    removeFiles(album.id, written);
    res.status(500).json({ error: 'Terjadi masalah saat menyimpan. Coba unggah lagi.' });
  }
});

// Pengupload mengubah pengaturan privasi fotonya
router.patch('/:code/photos/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM photos WHERE id = ? AND album_id = ?').get(Number(req.params.id), req.album.id);
  if (!p) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
  if (p.guest_id !== req.guestId) return res.status(403).json({ error: 'Hanya pengupload foto yang bisa mengubah pengaturannya.' });

  const visibility = req.body.visibility === 'private' ? 'private' : req.body.visibility === 'public' ? 'public' : p.visibility;
  const allow = visibility === 'public' && (req.body.allow_template === undefined ? p.allow_template === 1 : isTrue(req.body.allow_template)) ? 1 : 0;
  db.prepare('UPDATE photos SET visibility = ?, allow_template = ? WHERE id = ?').run(visibility, allow, p.id);

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(p.id);
  res.json(photoView(photo, accessResolver(req, req.album)(photo)));
});

// Pengupload (atau pemilik album) menghapus foto
router.delete('/:code/photos/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM photos WHERE id = ? AND album_id = ?').get(Number(req.params.id), req.album.id);
  if (!p) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
  const isOwner = !!(req.user && req.user.id === req.album.user_id);
  if (p.guest_id !== req.guestId && !isOwner) return res.status(403).json({ error: 'Kamu hanya bisa menghapus fotomu sendiri.' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
  removeFiles(req.album.id, [p.filename, p.thumb_filename, p.view_filename, p.blur_filename]);
  res.json({ ok: true });
});

// Tamu meminta akses ke foto privat milik orang lain
router.post('/:code/photos/:id/request', (req, res) => {
  const p = db.prepare('SELECT * FROM photos WHERE id = ? AND album_id = ?').get(Number(req.params.id), req.album.id);
  if (!p) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
  const acc = accessResolver(req, req.album)(p);
  if (acc.canView) return res.status(400).json({ error: 'Kamu sudah bisa melihat foto ini.' });

  db.prepare('INSERT OR IGNORE INTO access_requests (photo_id, album_id, guest_id, guest_name) VALUES (?, ?, ?, ?)')
    .run(p.id, req.album.id, req.guestId, cleanName(req.body.guest_name));
  const row = db.prepare('SELECT status FROM access_requests WHERE photo_id = ? AND guest_id = ?').get(p.id, req.guestId);
  res.json({ status: row.status });
});

// ---------- pesan dan kesan (selalu publik) ----------

router.get('/:code/messages', (req, res) => {
  const resolve = accessResolver(req, req.album);
  const isOwner = !!(req.user && req.user.id === req.album.user_id);
  const rows = db
    .prepare(
      `SELECT m.*, p.id AS p_id, p.guest_id AS p_guest, p.visibility AS p_vis, p.allow_template AS p_allow
         FROM messages m LEFT JOIN photos p ON p.id = m.photo_id
        WHERE m.album_id = ? ORDER BY m.created_at DESC, m.id DESC`
    )
    .all(req.album.id);

  res.json(
    rows.map((m) => {
      let thumb = null;
      if (m.p_id) {
        const acc = resolve({ id: m.p_id, guest_id: m.p_guest, visibility: m.p_vis, allow_template: m.p_allow });
        thumb = `/media/${m.p_id}/thumb?v=${m.p_vis}-${acc.canView ? 1 : 0}`;
      }
      return {
        id: m.id,
        guest_name: m.guest_name,
        text: m.text,
        created_at: m.created_at,
        audio_url: m.audio_filename ? `/media/message/${m.id}/audio` : null,
        photo_thumb_url: thumb,
        can_delete: isOwner || m.guest_id === req.guestId,
      };
    })
  );
});

router.post('/:code/messages', receiveFiles, (req, res) => {
  const album = req.album;
  const audio = req.files && req.files.audio && req.files.audio[0];
  const text = String(req.body.text || '').trim().slice(0, 300);
  const dir = path.join(UPLOADS_DIR, String(album.id));

  if (!uploadOpen(album, req)) return res.status(403).json({ error: 'Waktu kirim untuk album ini sudah ditutup.' });

  const audioName = saveAudio(audio, dir);
  if (audioName === false) return res.status(400).json({ error: 'Format atau ukuran suara tidak didukung (maksimal 5 MB).' });
  if (!text && !audioName) return res.status(400).json({ error: 'Tulis pesan atau rekam suara dulu.' });

  const result = db
    .prepare('INSERT INTO messages (album_id, guest_id, guest_name, text, audio_filename) VALUES (?, ?, ?, ?, ?)')
    .run(album.id, req.guestId, cleanName(req.body.guest_name), text || null, audioName || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:code/messages/:mid', (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ? AND album_id = ?').get(Number(req.params.mid), req.album.id);
  if (!m) return res.status(404).json({ error: 'Pesan tidak ditemukan.' });
  const isOwner = !!(req.user && req.user.id === req.album.user_id);
  if (m.guest_id !== req.guestId && !isOwner) return res.status(403).json({ error: 'Kamu hanya bisa menghapus pesanmu sendiri.' });
  db.prepare('DELETE FROM messages WHERE id = ?').run(m.id);
  removeFiles(req.album.id, [m.audio_filename]);
  res.json({ ok: true });
});

module.exports = router;