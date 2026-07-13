'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ── Configuration ──────────────────────────────────────────────────
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB — rotate when exceeded
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mictab.log');
const MAX_BACKUPS = 3;

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}

// ── Rotate & Clean Functions ─────────────────────────────────────────

function rotateLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stats = fs.statSync(LOG_FILE);
    if (stats.size <= MAX_LOG_SIZE) return;

    // Shift backups: e.g., mictab.2.log -> mictab.3.log, mictab.1.log -> mictab.2.log
    for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
      const src = path.join(LOG_DIR, `mictab.${i}.log`);
      const dest = path.join(LOG_DIR, `mictab.${i + 1}.log`);
      try {
        if (fs.existsSync(src)) {
          try { fs.unlinkSync(dest); } catch (e) {}
          fs.renameSync(src, dest);
        }
      } catch (e) {}
    }

    // Rename current log to mictab.1.log
    const backup1 = path.join(LOG_DIR, 'mictab.1.log');
    try { fs.unlinkSync(backup1); } catch (e) {}
    fs.renameSync(LOG_FILE, backup1);
  } catch (e) {}
}

function cleanOldLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(LOG_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > twoDaysMs) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {}
      }
    });
  } catch (e) {}
}

// Run cleanup and rotation on startup
try {
  cleanOldLogs();
  rotateLogs();
} catch (e) {}

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

let logCount = 0;
function writeLog(prefix, args) {
  try {
    const space = prefix === 'WARN' ? ' ' : '  ';
    const data = `[${ts()}] [${prefix}]${space}${fmt(args)}\n`;
    fs.appendFileSync(LOG_FILE, data);

    // Periodically check size and rotate during runtime
    logCount++;
    if (logCount % 200 === 0) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        rotateLogs();
        cleanOldLogs();
      }
    }
  } catch (e) {}
}

// ── Override console methods ───────────────────────────────────────
// Writes every log line to disk AND forwards to the original console
// so terminal output still works during development.
const _log   = console.log.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log = (...args) => {
  writeLog('LOG', args);
  try { _log(...args); } catch (e) {}
};

console.warn = (...args) => {
  writeLog('WARN', args);
  try { _warn(...args); } catch (e) {}
};

console.error = (...args) => {
  writeLog('ERR', args);
  try { _error(...args); } catch (e) {}
};

// ── Crash catchers ─────────────────────────────────────────────────
// Write synchronously on fatal crash so the line is guaranteed to persist.
let isExiting = false;
process.on('uncaughtException', (err) => {
  if (isExiting) return;
  isExiting = true;
  const msg = `[${ts()}] [FATAL] Uncaught Exception: ${err.stack || err}\n`;
  try { fs.appendFileSync(LOG_FILE, msg); } catch (e) {}
  try { _error('[FATAL] Uncaught Exception:', err); } catch (e) {}
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = `[${ts()}] [FATAL] Unhandled Rejection: ${(reason && (reason.stack || reason)) || reason}\n`;
  try { fs.appendFileSync(LOG_FILE, msg); } catch (e) {}
  try { _error('[FATAL] Unhandled Rejection:', reason); } catch (e) {}
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
