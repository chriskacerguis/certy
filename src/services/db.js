// src/services/db.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const appCfg = require('../config');

// Derive DB locations with safe defaults. In tests, isolate DB per worker unless BOTH overrides are provided.
const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
let CA_DIR;
let DB_PATH;

if (isTest) {
  if (process.env.LOCAL_CA_DIR && process.env.LOCAL_CA_DB) {
    CA_DIR = process.env.LOCAL_CA_DIR;
    DB_PATH = process.env.LOCAL_CA_DB;
  } else {
    const worker = process.env.JEST_WORKER_ID || '1';
    CA_DIR = path.join(process.cwd(), '.tmp-test', `worker-${worker}`, 'ca');
    DB_PATH = path.join(CA_DIR, 'ca.db');
  }
} else {
  CA_DIR = appCfg.caDir;
  DB_PATH = appCfg.caDbPath;
}
const MIGRATIONS_DIR = appCfg.migrationsDir;

fs.mkdirSync(CA_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(MIGRATIONS_DIR, { recursive: true, mode: 0o700 });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

function tx(fn) {
  const wrapped = db.transaction(fn);
  return wrapped();
}

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function listMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d+_.+\.(sql|js)$/.test(f))
    .sort((a, b) => a.localeCompare(b)); // numeric prefix ordering
  return files;
}

function alreadyAppliedSet() {
  const rows = db.prepare('SELECT name FROM schema_migrations').all();
  return new Set(rows.map(r => r.name));
}

function runMigrations() {
  ensureMigrationsTable();

  const files = listMigrationFiles();
  const applied = alreadyAppliedSet();

  for (const name of files) {
    if (applied.has(name)) continue;
    const full = path.join(MIGRATIONS_DIR, name);
    const ext = path.extname(name);

    try {
      tx(() => {
        if (ext === '.sql') {
          const sql = fs.readFileSync(full, 'utf8');
          db.exec(sql);
        } else if (ext === '.js') {
          const mod = require(full);
          if (!mod || typeof mod.up !== 'function') {
            throw new Error('JS migration must export an up(db) function');
          }
          mod.up(db);
        } else {
          throw new Error(`Unsupported migration extension: ${ext}`);
        }
        db.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)')
          .run(name, new Date().toISOString());
      });
      // eslint-disable-next-line no-console
      if ((process.env.LOG_LEVEL || 'info') === 'debug') console.log(`[migrate] applied ${name}`);
    } catch (e) {
      e.message = `Migration failed (${name}): ` + e.message;
      throw e;
    }
  }
}

runMigrations();

/* ---- Public helpers (unchanged API) ---- */

function getMeta(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key=?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}

function allocateSerialHex() {
  return tx(() => {
    const row = db.prepare('SELECT value FROM meta WHERE key=?').get('next_serial');
    const n = row ? BigInt(row.value) : 1000n;
    const hex = n.toString(16);
    setMeta('next_serial', (n + 1n).toString());
    return hex;
  });
}

module.exports = { db, tx, getMeta, setMeta, allocateSerialHex, DB_PATH, CA_DIR };
