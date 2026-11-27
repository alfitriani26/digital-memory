// Membuka database SQLite dan membuat semua tabel dari schema.sql.
// File database tersimpan di folder data/digital-memory.db (dibuat otomatis).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'digital-memory.db');

let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch (err) {
  // Fallback ke built-in node:sqlite (Node 22+) bila native addon better-sqlite3 gagal dimuat (mis. GLIBC lama di shared hosting)
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
}

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrasi ringan untuk database lama yang belum punya kolom layout_config di tabel templates
const tplCols = db.prepare('PRAGMA table_info(templates)').all();
if (!tplCols.some((c) => c.name === 'layout_config')) {
  db.exec('ALTER TABLE templates ADD COLUMN layout_config TEXT');
}

module.exports = db;