'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ── Configuration ──────────────────────────────────────────────────
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB — rotate when exceeded
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mictab.log');

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}

// Rotate: if current log exceeds 5 MB, move it to mictab.prev.log
try {
  const stats = fs.statSync(LOG_FILE);
  if (stats.size > MAX_LOG_SIZE) {
    const prev = path.join(LOG_DIR, 'mictab.prev.log');
    try { fs.unlinkSync(prev); } catch (e) {}
    fs.renameSync(LOG_FILE, prev);
  }
} catch (e) {} // File doesn't exist yet — fine

// Open write stream (append mode)
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// ── Helpers ────────────────────────────────────────────────────────
function ts() {
  return new Date().toISOString();
}

function fmt(args) {
  return args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

// ── Override console methods ───────────────────────────────────────
// Writes every log line to disk AND forwards to the original console
// so terminal output still works during development.
const _log   = console.log.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log = (...args) => {
  logStream.write(`[${ts()}] [LOG]  ${fmt(args)}\n`);
  _log(...args);
};

console.warn = (...args) => {
  logStream.write(`[${ts()}] [WARN] ${fmt(args)}\n`);
  _warn(...args);
};

console.error = (...args) => {
  logStream.write(`[${ts()}] [ERR]  ${fmt(args)}\n`);
  _error(...args);
};

// ── Crash catchers ─────────────────────────────────────────────────
// Write synchronously on fatal crash so the line is guaranteed to persist.
process.on('uncaughtException', (err) => {
  const msg = `[${ts()}] [FATAL] Uncaught Exception: ${err.stack || err}\n`;
  try { fs.appendFileSync(LOG_FILE, msg); } catch (e) {}
  _error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// ── Session header ─────────────────────────────────────────────────
const version = (() => { try { return app.getVersion(); } catch { return '?'; } })();
console.log(`\n${'='.repeat(60)}`);
console.log(`MicTab v${version} — Session started`);
console.log(`Platform: ${process.platform} (${process.arch})`);
console.log(`Electron: ${process.versions.electron}  Node: ${process.versions.node}`);
console.log(`Log file: ${LOG_FILE}`);
console.log(`${'='.repeat(60)}`);

module.exports = { LOG_FILE, LOG_DIR };
