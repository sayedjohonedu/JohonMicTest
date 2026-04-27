'use strict';

const { BrowserWindow, screen, desktopCapturer, ipcMain, nativeImage, clipboard, app, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

let captureOverlay = null;
let editorWindow   = null;
let capturedImage  = null;  // NativeImage of full screen
let editorDirty    = false; // Track if annotations were made since last save

/* ────────────────────────────────────────────
   1.  SCREEN CAPTURE
   ──────────────────────────────────────────── */

async function captureScreen() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const sf = primaryDisplay.scaleFactor || 1;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) },
  });

  if (!sources.length) return null;
  return sources[0].thumbnail;  // NativeImage
}

/* ────────────────────────────────────────────
   2.  CAPTURE OVERLAY  (region selection)
   ──────────────────────────────────────────── */

async function showCaptureOverlay() {
  // Don't open two overlays
  if (captureOverlay && !captureOverlay.isDestroyed()) {
    captureOverlay.focus();
    return;
  }

  // If editor is open with unsaved changes, ask user what to do
  if (editorWindow && !editorWindow.isDestroyed()) {
    if (editorDirty) {
      const choice = dialog.showMessageBoxSync(editorWindow, {
        type: 'question',
        buttons: ['Save & Continue', 'Discard & Continue', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'MicTab Lens',
        message: 'You have unsaved annotations.',
        detail: 'Would you like to save the current screenshot before taking a new one?',
      });

      if (choice === 2) return;  // Cancel — don't capture
      if (choice === 0) {
        // Save first — send IPC to editor to trigger save, then close
        editorWindow.webContents.send('lens-auto-save');
        // Give it a moment to save
        await new Promise(r => setTimeout(r, 300));
      }
    }
    // Close old editor (clean or after save/discard)
    if (editorWindow && !editorWindow.isDestroyed()) {
      editorWindow.destroy();
      editorWindow = null;
    }
  }

  // Grab the screen first (before the overlay appears)
  capturedImage = await captureScreen();
  if (!capturedImage) {
    console.error('[Lens] Could not capture screen');
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  captureOverlay = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'ui', 'lens-capture-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // macOS: make the window appear above everything including menu bar
  if (process.platform === 'darwin') {
    captureOverlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    captureOverlay.setAlwaysOnTop(true, 'screen-saver');
    captureOverlay.setSimpleFullScreen(true);
  } else {
    captureOverlay.setFullScreen(true);
  }

  captureOverlay.loadFile(path.join(__dirname, '..', '..', 'ui', 'lens-capture.html'));

  captureOverlay.webContents.on('did-finish-load', () => {
    if (!captureOverlay || captureOverlay.isDestroyed()) return;
    const b64 = capturedImage.toDataURL();
    captureOverlay.webContents.send('lens-set-screenshot', b64);
  });

  captureOverlay.on('closed', () => { captureOverlay = null; });
}

/* ────────────────────────────────────────────
   3.  EDITOR WINDOW
   ──────────────────────────────────────────── */

function showEditor(croppedDataUrl, region) {
  // Force-close previous editor if still alive
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.destroy();
    editorWindow = null;
  }

  editorDirty = false;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primaryDisplay.workAreaSize;

  const maxW = Math.round(sw * 0.9);
  const maxH = Math.round(sh * 0.9);
  const edW  = Math.min(region.width + 340 + 80, maxW);
  const edH  = Math.min(region.height + 140, maxH);

  editorWindow = new BrowserWindow({
    width: Math.max(edW, 900),
    height: Math.max(edH, 560),
    minWidth: 900,
    minHeight: 560,
    center: true,
    frame: false,
    transparent: false,
    resizable: true,
    title: 'MicTab Lens',
    backgroundColor: '#0f0f14',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'ui', 'lens-editor-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  editorWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'lens-editor.html'));

  editorWindow.webContents.on('did-finish-load', () => {
    // Guard: editor might have been closed before load finished
    if (!editorWindow || editorWindow.isDestroyed()) return;
    editorWindow.webContents.send('lens-load-image', croppedDataUrl);
  });

  editorWindow.webContents.on('console-message', (_, level, message, line) => {
    if (!editorWindow || editorWindow.isDestroyed()) return;
    console.log(`[Lens Editor] ${message} (line ${line})`);
  });

  editorWindow.on('closed', () => {
    editorWindow = null;
    editorDirty = false;
  });
}

/* ────────────────────────────────────────────
   4.  IPC  HANDLERS
   ──────────────────────────────────────────── */

function setupLensIpc() {
  // Region selected on capture overlay → crop & open editor
  ipcMain.on('lens-region-selected', (_, region) => {
    if (!capturedImage) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const sf = primaryDisplay.scaleFactor || 1;

    const cropped = capturedImage.crop({
      x: Math.round(region.x * sf),
      y: Math.round(region.y * sf),
      width: Math.round(region.width * sf),
      height: Math.round(region.height * sf),
    });

    const croppedDataUrl = cropped.toDataURL();

    if (captureOverlay && !captureOverlay.isDestroyed()) {
      captureOverlay.close();
    }

    showEditor(croppedDataUrl, region);
  });

  // Full-screen screenshot — bypass region selection
  ipcMain.on('lens-fullscreen-screenshot', () => {
    if (!capturedImage) return;
    const croppedDataUrl = capturedImage.toDataURL();
    if (captureOverlay && !captureOverlay.isDestroyed()) captureOverlay.close();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    showEditor(croppedDataUrl, { x: 0, y: 0, width, height });
  });

  // Cancel capture (Escape key)
  ipcMain.on('lens-capture-cancel', () => {
    if (captureOverlay && !captureOverlay.isDestroyed()) {
      captureOverlay.close();
    }
  });

  // Mark editor as dirty (annotations made)
  ipcMain.on('lens-mark-dirty', () => {
    editorDirty = true;
  });

  // Mark editor as clean (after save)
  ipcMain.on('lens-mark-clean', () => {
    editorDirty = false;
  });

  // Save screenshot to Downloads/MicTab ScreenRec
  ipcMain.handle('lens-save-image', async (_, dataUrl) => {
    const downloads = app.getPath('downloads');
    const saveDir   = path.join(downloads, 'MicTab ScreenRec');
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename  = `MicTab-Lens-${timestamp}.png`;
    const filePath  = path.join(saveDir, filename);

    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    editorDirty = false;

    // Open (or focus) the gallery and navigate to the new screenshot
    const { openGallery } = require('./gallery-manager');
    openGallery(filePath);

    return filePath;
  });

  // Copy image to clipboard
  ipcMain.on('lens-copy-image', (_, dataUrl) => {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
    clipboard.writeImage(img);
  });

  // Close editor
  ipcMain.on('lens-close-editor', () => {
    if (editorWindow && !editorWindow.isDestroyed()) {
      editorWindow.destroy();
      editorWindow = null;
      editorDirty = false;
    }
  });

  // OCR via Tesseract.js
  let ocrWorker = null;
  let ocrWorkerLang = null;

  ipcMain.handle('lens-ocr', async (_, { dataUrl, lang }) => {
    try {
      const Tesseract = require('tesseract.js');

      if (ocrWorker && ocrWorkerLang !== lang) {
        try { await ocrWorker.terminate(); } catch {}
        ocrWorker = null;
      }

      if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker(lang);
        ocrWorkerLang = lang;
      }

      const { data: { text } } = await ocrWorker.recognize(dataUrl);
      return { ok: true, text: text.trim() };
    } catch (err) {
      console.error('[Lens OCR] Error:', err);
      return { ok: false, error: err.message };
    }
  });

  // Translate text via free Google Translate API
  ipcMain.handle('lens-translate', async (_, { text, targetLang }) => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      const translated = data[0].map(seg => seg[0]).join('');
      return { ok: true, text: translated, detectedLang: data[2] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

/* ────────────────────────────────────────────
   EXPORTS
   ──────────────────────────────────────────── */

function isCaptureOverlayOpen() {
  return captureOverlay && !captureOverlay.isDestroyed();
}

function closeCaptureOverlay() {
  if (captureOverlay && !captureOverlay.isDestroyed()) {
    captureOverlay.close();
  }
}

/* ────────────────────────────────────────────
   6.  OPEN FROM GALLERY  (edit existing image)
   ──────────────────────────────────────────── */

/**
 * Open the Lens editor pre-loaded with an existing image file from the gallery.
 * The editor will receive the originFilePath so it can overwrite on save.
 */
function showEditorFromGallery(dataUrl, originFilePath, size) {
  // Force-close previous editor if open
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.destroy();
    editorWindow = null;
  }
  editorDirty = false;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primaryDisplay.workAreaSize;
  const maxW = Math.round(sw * 0.9);
  const maxH = Math.round(sh * 0.9);
  const edW  = Math.min((size.width || 800) + 340 + 80, maxW);
  const edH  = Math.min((size.height || 600) + 140, maxH);

  editorWindow = new BrowserWindow({
    width:  Math.max(edW, 900),
    height: Math.max(edH, 560),
    minWidth: 900,
    minHeight: 560,
    center: true,
    frame: false,
    transparent: false,
    resizable: true,
    title: 'MicTab Lens',
    backgroundColor: '#0f0f14',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'ui', 'lens-editor-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  editorWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'lens-editor.html'));

  editorWindow.webContents.on('did-finish-load', () => {
    if (!editorWindow || editorWindow.isDestroyed()) return;
    // Send both the image data and the original file path for overwrite-save
    editorWindow.webContents.send('lens-load-image', dataUrl);
    editorWindow.webContents.send('lens-set-origin-path', originFilePath);
  });

  editorWindow.webContents.on('console-message', (_, level, message, line) => {
    if (!editorWindow || editorWindow.isDestroyed()) return;
    console.log(`[Lens Editor] ${message} (line ${line})`);
  });

  editorWindow.on('closed', () => {
    editorWindow = null;
    editorDirty = false;
  });
}

module.exports = { showCaptureOverlay, showEditorFromGallery, setupLensIpc, isCaptureOverlayOpen, closeCaptureOverlay };
