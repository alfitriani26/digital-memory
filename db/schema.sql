-- Digital Memory: struktur database (SQLite)
-- Dibaca otomatis oleh db/database.js saat server pertama kali jalan.

PRAGMA foreign_keys = ON;

-- Pemilik acara (yang punya akun dan membuat album)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'premium')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sesi login pemilik acara
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Album acara (satu album = satu acara, punya kode untuk QR)
CREATE TABLE IF NOT EXISTS albums (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  event_date      TEXT,
  description     TEXT,
  code            TEXT NOT NULL UNIQUE,
  theme_color     TEXT NOT NULL DEFAULT '#E8A0B4',
  upload_until    TEXT,
  default_private INTEGER NOT NULL DEFAULT 0 CHECK (default_private IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Template tata letak buatan pemilik (tema bawaan atau gambar background sendiri)
CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id   INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'theme' CHECK (kind IN ('theme', 'image')),
  theme_key  TEXT,
  filename   TEXT,
  caption    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Foto dan video yang diunggah tamu atau pemilik
CREATE TABLE IF NOT EXISTS photos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id       INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  guest_id       TEXT NOT NULL,
  guest_name     TEXT,
  media_type     TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  filename       TEXT NOT NULL,
  thumb_filename TEXT,
  view_filename  TEXT,
  blur_filename  TEXT,
  original_name  TEXT,
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  allow_template INTEGER NOT NULL DEFAULT 0 CHECK (allow_template IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pesan dan kesan (selalu publik, walau fotonya privat)
CREATE TABLE IF NOT EXISTS messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id       INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id       INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  guest_id       TEXT NOT NULL,
  guest_name     TEXT,
  text           TEXT,
  audio_filename TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Permintaan akses tamu ke foto privat (disetujui atau ditolak pemilik)
CREATE TABLE IF NOT EXISTS access_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  album_id   INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  guest_id   TEXT NOT NULL,
  guest_name TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (photo_id, guest_id)
);

-- Index supaya pencarian cepat
CREATE INDEX IF NOT EXISTS idx_albums_user     ON albums(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_album    ON photos(album_id);
CREATE INDEX IF NOT EXISTS idx_photos_guest    ON photos(guest_id);
CREATE INDEX IF NOT EXISTS idx_messages_album  ON messages(album_id);
CREATE INDEX IF NOT EXISTS idx_requests_album  ON access_requests(album_id, status);