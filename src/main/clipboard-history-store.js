/**
 * clipboard-history-store.js
 * ──────────────────────────────────────────────────────────────────────────
 * Manages all clipboard history persistence for MicTab Clipboard Manager.
 *
 * Storage layout (inside Electron userData):
 *   clipboard-history.sqlite — SQLite database for O(1) text dedup and queries
 *   clipboard-images/        — PNG files referenced by entry.imagePath
 *
 * Design goals:
 *   • Never slow the app — fast SQLite queries
 *   • Supports free (7-day rolling) and paid (30/90/6mo/lifetime) retention
 *   • Favorites and pins are exempt from TTL pruning
 *   • Images: auto-captured up to 15 MB
 * ──────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');
const DB = require('better-sqlite3');
const AdmZip = require('adm-zip');

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES   = 15 * 1024 * 1024;  // 15 MB
const MAX_FREE_FAVS     = 10;
const MAX_PINS          = 100;
const PAGE_SIZE         = 300;               // entries per infinite-scroll page (search queries all)
const FREE_DAYS         = 7;

// Retention in milliseconds for each paid plan option
const RETENTION_MAP = {
  '7days':    FREE_DAYS        * 86400000,
  '30days':   30               * 86400000,
  '90days':   90               * 86400000,
  '6months':  180              * 86400000,
  'lifetime': Number.MAX_SAFE_INTEGER,
};

// Auto-category detection patterns
const AUTO_CATEGORIES = [
  { id: 'url',   label: 'URL',   icon: '🔗', test: t => /https?:\/\/\S+/.test(t) },
  { id: 'email', label: 'Email', icon: '📧', test: t => /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/.test(t) },
  { id: 'code',  label: 'Code',  icon: '💻', test: t => /```[\s\S]*```|^\s{4,}\S/m.test(t) || /\b(function|const|let|var|import|def |class |if \(|=>|{|})\b/.test(t) },
  { id: 'phone', label: 'Phone', icon: '📱', test: t => /(\+?\d[\d\s\-().]{7,}\d)/.test(t) },
];

// ── Paths ──────────────────────────────────────────────────────────────────

function getDataDir() {
  return app.getPath('userData');
}

function getImagesDir() {
  return path.join(getDataDir(), 'clipboard-images');
}

function getHistoryPath() {
  return path.join(getDataDir(), 'clipboard-history.json'); // legacy used for migration
}

function getSqlitePath() {
  return path.join(getDataDir(), 'clipboard-history.sqlite');
}

// ── In-memory state ────────────────────────────────────────────────────────

let _db         = null;
let _loaded     = false;

// ── Load / Save ────────────────────────────────────────────────────────────

function ensureDirs() {
  const imagesDir = getImagesDir();
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
}

function load() {
  if (_loaded) return;
  ensureDirs();
  
  _db = new DB(getSqlitePath());
  
  _db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      timestamp INTEGER,
      type TEXT,
      text TEXT,
      imagePath TEXT,
      isFavorite INTEGER,
      isPinned INTEGER,
      categories TEXT,
      userCategories TEXT,
      copyCount INTEGER,
      byteSize INTEGER,
      isDeleted INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON entries(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_text ON entries(text);
  `);

  // ── Schema migration: add columns that may be missing from older DB versions ──
  const existingCols = new Set(
    _db.prepare('PRAGMA table_info(entries)').all().map(r => r.name)
  );
  const neededCols = [
    { name: 'userCategories', def: 'TEXT DEFAULT "[]"' },
    { name: 'copyCount',      def: 'INTEGER DEFAULT 1'  },
    { name: 'byteSize',       def: 'INTEGER DEFAULT 0'  },
    { name: 'categories',     def: 'TEXT DEFAULT "[]"'  },
    { name: 'imagePath',      def: 'TEXT'               },
    { name: 'isDeleted',      def: 'INTEGER DEFAULT 0'  },
  ];
  for (const col of neededCols) {
    if (!existingCols.has(col.name)) {
      try {
        _db.exec(`ALTER TABLE entries ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[ClipboardStore] Added missing column: ${col.name}`);
      } catch (e) {
        console.warn(`[ClipboardStore] Could not add column ${col.name}:`, e.message);
      }
    }
  }

  // Auto-migrate from JSON if exists
  const oldJsonPath = getHistoryPath();
  if (fs.existsSync(oldJsonPath)) {
    try {
      const raw = fs.readFileSync(oldJsonPath, 'utf8');
      const oldEntries = JSON.parse(raw);
      if (Array.isArray(oldEntries) && oldEntries.length > 0) {
        const checkOld = _db.prepare('SELECT count(*) as c FROM entries').get();
        if (checkOld.c === 0) {
          const insertStmt = _db.prepare(`
            INSERT INTO entries (id, timestamp, type, text, imagePath, isFavorite, isPinned, categories, userCategories, copyCount, byteSize)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          _db.transaction(() => {
            for (const e of oldEntries) {
              insertStmt.run(
                e.id, 
                e.timestamp || Date.now(), 
                e.type, 
                e.text || null, 
                e.imagePath || null, 
                e.isFavorite ? 1 : 0, 
                e.isPinned ? 1 : 0, 
                JSON.stringify(e.categories || []), 
                JSON.stringify(e.userCategories || []), 
                e.copyCount || 1, 
                e.byteSize || 0
              );
            }
          })();
        }
      }
      fs.renameSync(oldJsonPath, oldJsonPath + '.migrated');
    } catch(err) {
      console.error('[ClipboardStore] JSON to SQLite migration failed', err.message);
    }
  }
  
  _loaded = true;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function autoDetectCategories(text) {
  if (!text) return [];
  return AUTO_CATEGORIES.filter(c => c.test(text)).map(c => c.id);
}

function parseEntryRow(row) {
  if (!row) return null;
  return {
    ...row,
    isFavorite: !!row.isFavorite,
    isPinned:   !!row.isPinned,
    categories: row.categories ? JSON.parse(row.categories) : [],
    userCategories: row.userCategories ? JSON.parse(row.userCategories) : []
  };
}

// ── Add Entry ──────────────────────────────────────────────────────────────

/**
 * Add a new clipboard entry.
 * Returns { added: bool, duplicate: bool, entry }
 */
function addEntry({ type, text, imagePath, byteSize }) {
  load();

  // Dedup check for text
  if (type === 'text' && text) {
    const existing = _db.prepare('SELECT * FROM entries WHERE text = ?').get(text);
    if (existing) {
      // Move existing entry to top by bumping timestamp
      const newTimestamp = Date.now();
      _db.prepare(`UPDATE entries SET timestamp = ?, copyCount = copyCount + 1 WHERE id = ?`).run(newTimestamp, existing.id);
      
      existing.copyCount = (existing.copyCount || 1) + 1;
      existing.timestamp = newTimestamp;
      return { added: false, duplicate: true, entry: parseEntryRow(existing) };
    }
  }

  const categories = type === 'text' ? autoDetectCategories(text) : ['image'];
  const newId = uuid();
  const timestamp = Date.now();
  const actualByteSize = byteSize || (text ? Buffer.byteLength(text, 'utf8') : 0);

  _db.prepare(`
    INSERT INTO entries (id, timestamp, type, text, imagePath, isFavorite, isPinned, categories, userCategories, copyCount, byteSize)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, '[]', 1, ?)
  `).run(
    newId, timestamp, type, text || null, imagePath || null, JSON.stringify(categories), actualByteSize
  );

  return { 
    added: true, 
    duplicate: false, 
    entry: parseEntryRow(_db.prepare('SELECT * FROM entries WHERE id = ?').get(newId)) 
  };
}

// ── Delete ─────────────────────────────────────────────────────────────────

function deleteEntry(id, context) {
  load();
  const entry = parseEntryRow(_db.prepare('SELECT type, imagePath, isFavorite, isPinned, categories, userCategories, isDeleted FROM entries WHERE id = ?').get(id));
  if (!entry) return false;

  const category = context ? context.category : null;
  const section = context ? context.section : 'all';

  let shouldDelete = false;

  if (category) {
    // Remove from specific category
    entry.categories = entry.categories.filter(c => c !== category);
    entry.userCategories = entry.userCategories.filter(c => c !== category);
    _db.prepare('UPDATE entries SET categories = ?, userCategories = ? WHERE id = ?')
       .run(JSON.stringify(entry.categories), JSON.stringify(entry.userCategories), id);
    
    // Auto-delete if nothing saves it anymore
    if (entry.categories.length === 0 && entry.userCategories.length === 0 && entry.isDeleted) {
      if (!entry.isFavorite && !entry.isPinned) shouldDelete = true;
    }
  } else if (section === 'all' || section === 'images') {
    // Deleting from general view
    if (entry.categories.length > 0 || entry.userCategories.length > 0 || entry.isFavorite || entry.isPinned) {
      _db.prepare('UPDATE entries SET isDeleted = 1 WHERE id = ?').run(id);
    } else {
      shouldDelete = true;
    }
  } else if (section === 'favorites') {
    _db.prepare('UPDATE entries SET isFavorite = 0 WHERE id = ?').run(id);
    if (entry.categories.length === 0 && entry.userCategories.length === 0 && entry.isDeleted && !entry.isPinned) shouldDelete = true;
  } else if (section === 'pinned') {
    _db.prepare('UPDATE entries SET isPinned = 0 WHERE id = ?').run(id);
    if (entry.categories.length === 0 && entry.userCategories.length === 0 && entry.isDeleted && !entry.isFavorite) shouldDelete = true;
  } else {
    shouldDelete = true;
  }

  if (shouldDelete) {
    if (entry.type === 'image' && entry.imagePath) {
      fs.unlink(entry.imagePath, () => {});
    }
    _db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  }
  return true;
}

function deleteAll() {
  load();
  // Delete ALL image files first
  const imagesDir = getImagesDir();
  if (fs.existsSync(imagesDir)) {
    try {
      const files = fs.readdirSync(imagesDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(imagesDir, file));
        } catch (_) {}
      }
    } catch (e) {
      console.warn('[ClipboardStore] Could not clear images dir:', e.message);
    }
  }
  // Wipe the entire database — no exceptions (favorites, pinned, categorized — all gone)
  _db.prepare('DELETE FROM entries').run();
}

/**
 * Delete entries from a specific calendar date (YYYY-MM-DD string or timestamp)
 * Preserves favorites and pinned items.
 */
function deleteDay(dateMs) {
  load();
  const dayStart = new Date(dateMs);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateMs);
  dayEnd.setHours(23, 59, 59, 999);

  const toDelete = _db.prepare(`
    SELECT id, type, imagePath FROM entries 
    WHERE isFavorite = 0 AND isPinned = 0 
      AND timestamp >= ? AND timestamp <= ?
  `).all(dayStart.getTime(), dayEnd.getTime());

  for (const e of toDelete) {
    if (e.type === 'image' && e.imagePath) fs.unlink(e.imagePath, () => {});
    _db.prepare('DELETE FROM entries WHERE id = ?').run(e.id);
  }

  return toDelete.length;
}

function deleteOldestDay() {
  load();
  const oldest = _db.prepare(`
    SELECT timestamp FROM entries 
    WHERE isFavorite = 0 AND isPinned = 0 
    ORDER BY timestamp ASC LIMIT 1
  `).get();
  
  if (!oldest) return 0;
  return deleteDay(oldest.timestamp);
}

// ── TTL Pruning ────────────────────────────────────────────────────────────

function getExpiredEntriesRaw(isPaid, retentionPlan) {
  const maxAge = isPaid ? (RETENTION_MAP[retentionPlan] || RETENTION_MAP['lifetime']) : RETENTION_MAP['7days'];
  if (maxAge === Number.MAX_SAFE_INTEGER) return [];

  const cutoff = Date.now() - maxAge;
  return _db.prepare(`
    SELECT * FROM entries 
    WHERE isFavorite = 0 AND isPinned = 0 AND timestamp < ?
  `).all(cutoff);
}

function getExpiredEntries(isPaid, retentionPlan) {
  load();
  return getExpiredEntriesRaw(isPaid, retentionPlan).map(parseEntryRow);
}

function pruneExpired(isPaid, retentionPlan) {
  load();
  const expired = getExpiredEntriesRaw(isPaid, retentionPlan);
  if (!expired.length) return { count: 0, oldestDate: null };

  const oldestDate = new Date(Math.min(...expired.map(e => e.timestamp)));

  for (const e of expired) {
    if (e.type === 'image' && e.imagePath) fs.unlink(e.imagePath, () => {});
    _db.prepare('DELETE FROM entries WHERE id = ?').run(e.id);
  }

  return { count: expired.length, oldestDate };
}

function checkFreeUserExpiry() {
  load();
  const oldest = _db.prepare(`
    SELECT timestamp FROM entries 
    WHERE isFavorite = 0 AND isPinned = 0 
    ORDER BY timestamp ASC LIMIT 1
  `).get();
  
  if (!oldest) return null;
  const age = Date.now() - oldest.timestamp;
  if (age > RETENTION_MAP['7days']) {
    return { oldestDate: new Date(oldest.timestamp) };
  }
  return null;
}

// ── Favorites ──────────────────────────────────────────────────────────────

function toggleFavorite(id, isPaid) {
  load();
  const entry = _db.prepare('SELECT type, isFavorite FROM entries WHERE id = ?').get(id);
  if (!entry) return { ok: false, reason: 'not_found' };

  if (!entry.isFavorite) {
    // Adding favorite
    if (!isPaid && entry.type === 'image') {
      return { ok: false, reason: 'image_fav_paid_only' };
    }
    if (!isPaid) {
      const favCount = _db.prepare('SELECT count(*) as c FROM entries WHERE isFavorite = 1').get().c;
      if (favCount >= MAX_FREE_FAVS) {
        return { ok: false, reason: 'free_limit_reached', limit: MAX_FREE_FAVS };
      }
    }
  }

  const newState = entry.isFavorite ? 0 : 1;
  _db.prepare('UPDATE entries SET isFavorite = ? WHERE id = ?').run(newState, id);
  return { ok: true, isFavorite: !!newState };
}

// ── Pins ───────────────────────────────────────────────────────────────────

function togglePin(id) {
  load();
  const entry = _db.prepare('SELECT isPinned FROM entries WHERE id = ?').get(id);
  if (!entry) return { ok: false, reason: 'not_found' };

  if (!entry.isPinned) {
    const pinCount = _db.prepare('SELECT count(*) as c FROM entries WHERE isPinned = 1').get().c;
    if (pinCount >= MAX_PINS) {
      return { ok: false, reason: 'pin_limit_reached', limit: MAX_PINS };
    }
  }

  const newState = entry.isPinned ? 0 : 1;
  _db.prepare('UPDATE entries SET isPinned = ? WHERE id = ?').run(newState, id);
  return { ok: true, isPinned: !!newState };
}

// ── Categories ─────────────────────────────────────────────────────────────

function setUserCategories(id, userCategories) {
  load();
  const entry = _db.prepare('SELECT id FROM entries WHERE id = ?').get(id);
  if (!entry) return false;
  
  const catsStr = JSON.stringify(Array.isArray(userCategories) ? userCategories : []);
  _db.prepare('UPDATE entries SET userCategories = ? WHERE id = ?').run(catsStr, id);
  return true;
}

function addBuiltinCategory(id, cat) {
  load();
  const entry = parseEntryRow(_db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
  if (!entry) return { ok: false, reason: 'not_found' };
  
  if (entry.categories.includes(cat)) return { ok: true, already: true };
  entry.categories.push(cat);
  
  _db.prepare('UPDATE entries SET categories = ? WHERE id = ?').run(JSON.stringify(entry.categories), id);
  return { ok: true, already: false };
}

function addUserCategory(id, cat) {
  load();
  const entry = parseEntryRow(_db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
  if (!entry) return { ok: false, reason: 'not_found' };
  
  if (entry.userCategories.includes(cat)) return { ok: true, already: true };
  entry.userCategories.push(cat);
  
  _db.prepare('UPDATE entries SET userCategories = ? WHERE id = ?').run(JSON.stringify(entry.userCategories), id);
  return { ok: true, already: false };
}

// ── Edit entry ─────────────────────────────────────────────────────────────

function editEntryText(id, newText) {
  load();
  const entry = _db.prepare('SELECT type FROM entries WHERE id = ?').get(id);
  if (!entry || entry.type !== 'text') return false;

  const categories = JSON.stringify(autoDetectCategories(newText));
  const byteSize = Buffer.byteLength(newText, 'utf8');
  const timestamp = Date.now(); // bump to top

  _db.prepare(`
    UPDATE entries 
    SET text = ?, categories = ?, byteSize = ?, timestamp = ?
    WHERE id = ?
  `).run(newText, categories, byteSize, timestamp, id);
  return true;
}

/**
 * Bump an entry to the top of the list by updating its timestamp.
 * Also increments copyCount. Used when user clicks to copy an entry.
 */
function bumpToTop(id) {
  load();
  const entry = _db.prepare('SELECT id FROM entries WHERE id = ?').get(id);
  if (!entry) return false;
  const newTimestamp = Date.now();
  _db.prepare('UPDATE entries SET timestamp = ?, copyCount = copyCount + 1 WHERE id = ?').run(newTimestamp, id);
  return true;
}

// ── Query ──────────────────────────────────────────────────────────────────

function query(options = {}) {
  load();
  const { section = 'all', category = null, search = null,
          dateFrom = null, dateTo = null, page = 0 } = options;

  let whereClauses = [];
  let params = [];

  // Section filter
  if (section === 'favorites') whereClauses.push('isFavorite = 1');
  else if (section === 'pinned') whereClauses.push('isPinned = 1');
  else if (section === 'images') whereClauses.push('type = "image"');

  // isDeleted filter
  if (!category && section !== 'favorites' && section !== 'pinned') {
    whereClauses.push('isDeleted = 0');
  }

  // Category filter
  if (category) {
    whereClauses.push(`(categories LIKE ? OR userCategories LIKE ?)`);
    params.push(`%"${category}"%`);
    params.push(`%"${category}"%`);
  }

  // Date range
  if (dateFrom != null) {
    whereClauses.push('timestamp >= ?');
    params.push(dateFrom);
  }
  if (dateTo != null) {
    whereClauses.push('timestamp <= ?');
    params.push(dateTo);
  }

  // Keyword search
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    whereClauses.push(`(text LIKE ? OR categories LIKE ? OR userCategories LIKE ?)`);
    params.push(q, q, q);
  }

  const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  // Get total
  const countSql = `SELECT count(*) as total FROM entries ${whereSql}`;
  const total = _db.prepare(countSql).get(...params).total;

  // Get page
  const start = page * PAGE_SIZE;
  const selectSql = `SELECT * FROM entries ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  const rows = _db.prepare(selectSql).all(...params, PAGE_SIZE, start);

  const pageEntries = rows.map(parseEntryRow);

  return { 
    entries: pageEntries, 
    total, 
    page, 
    pageSize: PAGE_SIZE,
    hasMore: start + PAGE_SIZE < total 
  };
}

function getEntryById(id) {
  load();
  const row = _db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  return parseEntryRow(row);
}

function getEntryDates() {
  load();
  const rows = _db.prepare(`
    SELECT timestamp FROM entries 
    WHERE isFavorite = 0 AND isPinned = 0
    ORDER BY timestamp DESC
  `).all();
  
  const dates = new Set();
  for (const r of rows) {
    const d = new Date(r.timestamp);
    dates.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  return [...dates];
}

function getUserCategoryList() {
  load();
  const rows = _db.prepare('SELECT userCategories FROM entries WHERE userCategories != "[]"').all();
  const set = new Set();
  for (const r of rows) {
    try {
      const cats = JSON.parse(r.userCategories);
      for (const c of cats) set.add(c);
    } catch (_) {}
  }
  return [...set].sort();
}

function getStats() {
  load();
  const row = _db.prepare(`
    SELECT 
      count(*) as total,
      SUM(CASE WHEN isFavorite = 1 THEN 1 ELSE 0 END) as favorites,
      SUM(CASE WHEN isPinned = 1 THEN 1 ELSE 0 END) as pinned,
      SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as images
    FROM entries
  `).get();
  
  return {
    total:      row.total || 0,
    favorites:  row.favorites || 0,
    pinned:     row.pinned || 0,
    images:     row.images || 0,
  };
}

// ── Export / Import ────────────────────────────────────────────────────────

/**
 * Generate a .mictab-backup zip file at outPath
 */
function exportBackup(outPath) {
  load();
  const textEntries = _db.prepare("SELECT * FROM entries").all().map(parseEntryRow);
  
  const payload = {
    schema:        3,
    exportedAt:    new Date().toISOString(),
    entries:       textEntries,
  };

  const zip = new AdmZip();
  // Add history.json
  zip.addFile("history.json", Buffer.from(JSON.stringify(payload, null, 2)));

  // Add images
  const imagesDir = getImagesDir();
  if (fs.existsSync(imagesDir)) {
    zip.addLocalFolder(imagesDir, "clipboard-images");
  }

  // Write out sync
  zip.writeZip(outPath);
}

/**
 * Import from a .mictab-backup zip file
 */
function importBackup(inPath, mode = 'merge') {
  load();
  
  let zip;
  try {
    zip = new AdmZip(inPath);
  } catch (err) {
    return { ok: false, reason: 'invalid_zip' };
  }

  const jsonEntry = zip.getEntry("history.json");
  if (!jsonEntry) {
    return { ok: false, reason: 'invalid_format' };
  }

  let parsed;
  try {
    parsed = JSON.parse(zip.readAsText(jsonEntry));
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    return { ok: false, reason: 'invalid_format' };
  }

  if (mode === 'replace') {
    _db.prepare('DELETE FROM entries').run();
  }

  const incomingTexts = parsed.entries.filter(e => e.type === 'text' && e.text);
  const incomingImages = parsed.entries.filter(e => e.type === 'image' && e.imagePath);

  let added = 0;

  // Insert texts
  const insertStmt = _db.prepare(`
    INSERT INTO entries (id, timestamp, type, text, imagePath, isFavorite, isPinned, categories, userCategories, copyCount, byteSize)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  _db.transaction(() => {
    for (const e of [...incomingTexts, ...incomingImages]) {
      if (e.type === 'text') {
        const existing = _db.prepare('SELECT id FROM entries WHERE text = ?').get(e.text);
        if (existing) continue; // Skip exact duplicates
      } else if (e.type === 'image') {
        const existing = _db.prepare('SELECT id FROM entries WHERE id = ?').get(e.id);
        if (existing) continue; // Skip identical ID images
      }
      
      const categoriesStr = JSON.stringify(e.type === 'text' ? autoDetectCategories(e.text) : ['image']);
      
      insertStmt.run(
        e.id || uuid(),
        e.timestamp || Date.now(),
        e.type,
        e.text || null,
        e.imagePath || null,
        e.isFavorite ? 1 : 0,
        e.isPinned ? 1 : 0,
        categoriesStr,
        JSON.stringify(e.userCategories || []),
        e.copyCount || 1,
        e.type === 'text' ? Buffer.byteLength(e.text, 'utf8') : e.byteSize || 0
      );
      added++;
    }
  })();

  // Extract images
  zip.getEntries().forEach(function(zipEntry) {
    if (zipEntry.entryName.startsWith("clipboard-images/") && !zipEntry.isDirectory) {
      zip.extractEntryTo(zipEntry, getDataDir(), true, true);
    }
  });

  return { ok: true, added, total: _db.prepare('SELECT count(*) as c FROM entries').get().c };
}

// ── Image file helpers ─────────────────────────────────────────────────────

function getImagesDirPath() {
  return getImagesDir();
}

function saveImageFile(id, buffer) {
  ensureDirs();
  const filePath = path.join(getImagesDir(), `${id}.png`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Core
  load,
  addEntry,
  deleteEntry,
  deleteAll,
  deleteDay,
  deleteOldestDay,

  // TTL
  pruneExpired,
  checkFreeUserExpiry,
  getExpiredEntries,

  // Features
  toggleFavorite,
  togglePin,
  setUserCategories,
  addBuiltinCategory,
  addUserCategory,
  editEntryText,
  bumpToTop,

  // Query
  query,
  getEntryById,
  getEntryDates,
  getUserCategoryList,
  getStats,

  // Import/Export
  exportBackup,
  importBackup,

  // Image helpers
  getImagesDirPath,
  saveImageFile,

  // Constants (exported for UI use)
  AUTO_CATEGORIES,
  MAX_FREE_FAVS,
  MAX_PINS,
  PAGE_SIZE,
};
