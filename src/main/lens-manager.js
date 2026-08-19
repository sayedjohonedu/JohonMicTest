'use strict';

const { BrowserWindow, ipcMain, nativeImage, clipboard, app, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const { getActiveDisplay, captureDisplay } = require('./screen-helper');

let captureOverlay       = null;
let editorWindow         = null;
let capturedImage        = null;  // NativeImage of active screen
let activeCaptureDisplay = null;  // Display targeted during active capture session
let editorDirty          = false; // Track if annotations were made since last save

/* ────────────────────────────────────────────
   1.  SCREEN CAPTURE
   ──────────────────────────────────────────── */

async function captureScreen(targetDisplay) {
  const result = await captureDisplay(targetDisplay);
  if (!result || !result.thumbnail) return null;
  return result.thumbnail;  // NativeImage
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

  // Identify monitor where user cursor is located
  activeCaptureDisplay = getActiveDisplay();

  // Grab the target screen first (before the overlay appears)
  capturedImage = await captureScreen(activeCaptureDisplay);
  if (!capturedImage) {
    console.error('[Lens] Could not capture screen for display:', activeCaptureDisplay.id);
    return;
  }

  const bounds = activeCaptureDisplay.bounds;

  captureOverlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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

  // Explicitly ensure bounds on target display across macOS and Windows
  captureOverlay.setBounds(bounds);

  // macOS & Windows: make the window appear above everything including menu bar/taskbar
  if (process.platform === 'darwin') {
    captureOverlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    captureOverlay.setAlwaysOnTop(true, 'screen-saver');
  } else {
    captureOverlay.setAlwaysOnTop(true, 'screen-saver');
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

function showEditor(croppedDataUrl, region, targetDisplay) {
  // Force-close previous editor if still alive
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.destroy();
    editorWindow = null;
  }

  editorDirty = false;

  const display = targetDisplay || activeCaptureDisplay || getActiveDisplay();
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

  const maxW = Math.round(dw * 0.95);
  const maxH = Math.round(dh * 0.95);
  const regW = (region && region.width) ? region.width : 800;
  const regH = (region && region.height) ? region.height : 600;

  const edW  = Math.min(Math.max(regW + 340 + 80, 1160), maxW);
  const edH  = Math.min(Math.max(regH + 140, 560), maxH);

  const edX = dx + Math.round((dw - edW) / 2);
  const edY = dy + Math.round((dh - edH) / 2);

  editorWindow = new BrowserWindow({
    x: edX,
    y: edY,
    width: edW,
    height: edH,
    minWidth: Math.min(1160, dw),
    minHeight: Math.min(560, dh),
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

    const display = activeCaptureDisplay || getActiveDisplay();
    const imgSize = capturedImage.getSize();
    const bounds = display.bounds;

    // Calculate dynamic scaling ratios from actual captured buffer vs logical display bounds (handles fractional Windows DPI 125%, 150%, 175%)
    const scaleX = (bounds.width > 0 && imgSize.width > 0) ? (imgSize.width / bounds.width) : (display.scaleFactor || 1);
    const scaleY = (bounds.height > 0 && imgSize.height > 0) ? (imgSize.height / bounds.height) : (display.scaleFactor || 1);

    // Bounded coordinates preventing any out-of-bounds error on high-DPI Windows displays
    const rawX = Math.round(region.x * scaleX);
    const rawY = Math.round(region.y * scaleY);
    const rawW = Math.round(region.width * scaleX);
    const rawH = Math.round(region.height * scaleY);

    const cropX = Math.max(0, Math.min(rawX, imgSize.width - 1));
    const cropY = Math.max(0, Math.min(rawY, imgSize.height - 1));
    const cropW = Math.max(1, Math.min(rawW, imgSize.width - cropX));
    const cropH = Math.max(1, Math.min(rawH, imgSize.height - cropY));

    const cropped = capturedImage.crop({
      x: cropX,
      y: cropY,
      width: cropW,
      height: cropH,
    });

    const croppedDataUrl = cropped.toDataURL();

    if (captureOverlay && !captureOverlay.isDestroyed()) {
      captureOverlay.close();
    }

    showEditor(croppedDataUrl, region, display);
  });

  // Full-screen screenshot — bypass region selection
  ipcMain.on('lens-fullscreen-screenshot', () => {
    if (!capturedImage) return;
    const croppedDataUrl = capturedImage.toDataURL();
    if (captureOverlay && !captureOverlay.isDestroyed()) captureOverlay.close();
    const display = activeCaptureDisplay || getActiveDisplay();
    const { width, height } = display.bounds;
    showEditor(croppedDataUrl, { x: 0, y: 0, width, height }, display);
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

  // Save screenshot with a user-supplied name
  ipcMain.handle('lens-save-image-named', async (_, { dataUrl, name }) => {
    const downloads = app.getPath('downloads');
    const saveDir   = path.join(downloads, 'MicTab ScreenRec');
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

    // Sanitize name — strip path separators and control chars, ensure .png
    let safeName = (name || '').replace(/[/\\:*?"<>|]/g, '_').trim();
    if (!safeName) {
      // Fallback to timestamp if empty
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      safeName = `MicTab-Lens-${ts}`;
    }
    if (!safeName.toLowerCase().endsWith('.png')) safeName += '.png';

    const filePath = path.join(saveDir, safeName);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    editorDirty = false;

    // Open (or focus) the gallery and navigate to the new screenshot
    const { openGallery } = require('./gallery-manager');
    openGallery(filePath);

    return { ok: true, filePath };
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
   5.  HELPERS & EXPORTS
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

  const display = getActiveDisplay();
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
  const maxW = Math.round(dw * 0.95);
  const maxH = Math.round(dh * 0.95);
  const edW  = Math.min(Math.max(((size && size.width) || 800) + 340 + 80, 1160), maxW);
  const edH  = Math.min(Math.max(((size && size.height) || 600) + 140, 560), maxH);

  const edX = dx + Math.round((dw - edW) / 2);
  const edY = dy + Math.round((dh - edH) / 2);

  editorWindow = new BrowserWindow({
    x: edX,
    y: edY,
    width:  edW,
    height: edH,
    minWidth: Math.min(1160, dw),
    minHeight: Math.min(560, dh),
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

  editorWindow.on('closed', () => {
    editorWindow = null;
    editorDirty = false;
  });
}

/**
 * Capture the full screen and open the Lens editor directly,
 * bypassing the region-selection overlay. Used by the tray "Screenshot" item.
 */
async function captureFullscreen() {
  // If editor is open with unsaved changes, just close it — tray action is intentional
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.destroy();
    editorWindow = null;
    editorDirty = false;
  }
  const display = getActiveDisplay();
  const img = await captureScreen(display);
  if (!img) {
    console.error('[Lens] captureFullscreen: could not capture screen');
    return;
  }
  const { width, height } = display.bounds;
  showEditor(img.toDataURL(), { x: 0, y: 0, width, height }, display);
}

module.exports = { showCaptureOverlay, showEditorFromGallery, setupLensIpc, isCaptureOverlayOpen, closeCaptureOverlay, captureFullscreen };
