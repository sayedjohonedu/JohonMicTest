/**
 * clipboard-monitor.js
 * ──────────────────────────────────────────────────────────────────────────
 * Polls the system clipboard every 500ms and fires a callback whenever
 * new text or image content is detected.
 *
 * Handles:
 *   • Text change detection (content hash comparison)
 *   • Image change detection (NativeImage size comparison)
 *   • 15MB image size cap
 *   • Saving image files to userData/clipboard-images/
 * ──────────────────────────────────────────────────────────────────────────
 */

const { clipboard, nativeImage } = require('electron');
const store = require('../../store/config');
const historyStore = require('./clipboard-history-store');

const POLL_INTERVAL_MS = 500;
const MAX_IMAGE_BYTES  = 15 * 1024 * 1024;

let _timer        = null;
let _lastText     = '';
let _lastImgSize  = '';   // "WxH" of last image — lightweight change indicator
let _onNewEntry   = null; // callback(entry)

// ── Suppression ────────────────────────────────────────────────────────────
// Texts written by dictation injection that should NOT be recorded as history.
// We keep a Set so multiple rapid dictation writes are all suppressed.
const _suppressedTexts = new Set();
const _suppressTimers  = new Map(); // text → clearTimeout handle

/**
 * Tell the monitor to ignore the next occurrence of `text` in the clipboard.
 * Called by clipboard-manager BEFORE it writes dictation text to clipboard.
 * The suppression auto-expires after 2 s as a safety net.
 * @param {string} text
 */
function suppressNext(text) {
  if (!text) return;
  // Clear any existing timer for this text
  if (_suppressTimers.has(text)) {
    clearTimeout(_suppressTimers.get(text));
  }
  _suppressedTexts.add(text);
  // Also advance _lastText so even if suppression misses, we don't double-record
  _lastText = text;
  const timer = setTimeout(() => {
    _suppressedTexts.delete(text);
    _suppressTimers.delete(text);
  }, 2000);
  _suppressTimers.set(text, timer);
}

/**
 * Start monitoring the clipboard.
 * @param {Function} onNewEntry - called with (entry) when a new item is captured
 */
function start(onNewEntry) {
  if (_timer) return;                  // already running
  _onNewEntry = onNewEntry;

  // Snapshot current clipboard so we don't fire on the very first poll
  _lastText    = clipboard.readText() || '';
  const img    = clipboard.readImage();
  _lastImgSize = img && !img.isEmpty() ? `${img.getSize().width}x${img.getSize().height}` : '';

  _timer = setInterval(_poll, POLL_INTERVAL_MS);
  console.log('[ClipboardMonitor] Started');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  console.log('[ClipboardMonitor] Stopped');
}

function isRunning() { return _timer !== null; }

// ── Poll ───────────────────────────────────────────────────────────────────

function _poll() {
  try {
    _checkText();
    _checkImage();
  } catch (e) {
    // Never crash the poll loop
    console.error('[ClipboardMonitor] poll error:', e.message);
  }
}

function _checkText() {
  const text = clipboard.readText() || '';
  if (!text || text === _lastText) return;

  _lastText = text;

  // Skip if looks like a password (very short + all symbols — basic heuristic)
  // No full privacy mode as per spec, just skip empty/whitespace
  if (!text.trim()) return;

  // ── Skip dictation-injected text ──────────────────────────────────────────
  // clipboard-manager.suppressNext(text) is called before every dictation write.
  // If this text is in the suppression set, drop it silently and clean up.
  if (_suppressedTexts.has(text)) {
    _suppressedTexts.delete(text);
    if (_suppressTimers.has(text)) {
      clearTimeout(_suppressTimers.get(text));
      _suppressTimers.delete(text);
    }
    console.log('[ClipboardMonitor] Skipped dictation text (suppressed)');
    return;
  }

  const result = historyStore.addEntry({ type: 'text', text });
  if (_onNewEntry) _onNewEntry(result.entry, result.duplicate);
}

function _checkImage() {
  const img = clipboard.readImage();
  if (!img || img.isEmpty()) return;

  const sz = img.getSize();
  const sizeKey = `${sz.width}x${sz.height}`;
  if (sizeKey === _lastImgSize) return;

  _lastImgSize = sizeKey;

  // Check image size before saving
  const pngBuffer = img.toPNG();
  if (pngBuffer.byteLength > MAX_IMAGE_BYTES) {
    console.log(`[ClipboardMonitor] Image too large (${(pngBuffer.byteLength/1024/1024).toFixed(1)} MB) — skipped`);
    return;
  }

  // Generate ID first so we can name the file
  const tempId = _uuid();
  const imagePath = historyStore.saveImageFile(tempId, pngBuffer);

  const result = historyStore.addEntry({
    type:      'image',
    imagePath,
    byteSize:  pngBuffer.byteLength,
  });

  // If addEntry returned a dedup (shouldn't for images, but just in case)
  if (_onNewEntry) _onNewEntry(result.entry, result.duplicate);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

module.exports = { start, stop, isRunning, suppressNext };
