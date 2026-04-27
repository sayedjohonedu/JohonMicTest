'use strict';

/**
 * screen-recorder-manager.js  (v2)
 *
 * Architecture:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  CONTROL BAR (small draggable window, NOT recorded)             │
 *  │   setContentProtection(true) → invisible to desktopCapturer     │
 *  │   • Timer  • Pause  • Stop & Save  • Cancel  • Add Camera btn  │
 *  └─────────────────────────────────────────────────────────────────┘
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  CAMERA WINDOW (separate draggable window, IS recorded)         │
 *  │   setContentProtection(false) → visible in recording            │
 *  │   • Video feed  • Rect/Circle shape  • Resize  • Drag           │
 *  └─────────────────────────────────────────────────────────────────┘
 */

const {
  BrowserWindow, ipcMain, screen, desktopCapturer, app, shell,
} = require('electron');
const path   = require('path');
const fs     = require('fs');
const { exec } = require('child_process');
const store  = require('../../store/config');
const { openGallery } = require('./gallery-manager');

/* ── NOTE on native cursor in screen capture ─────────────────
   The OS (both macOS and Windows) composites the native cursor
   into the capture stream at the system level, before Electron
   receives the frames.  There is no reliable Electron/Chromium
   API to exclude it — `cursor:'never'`, `applyConstraints`,
   `CGDisplayHideCursor`, and `setDisplayMediaRequestHandler`
   all fail to affect the captured stream.
   The custom animated cursor drawn on the canvas overlay is
   the professional enhancement; the native cursor remains as a
   subtle secondary indicator.  A proper fix would require a
   native addon calling ScreenCaptureKit (macOS) or WGC (Win)
   with their `showsCursor = false` flags directly.           */

/* ── Window references ───────────────────────────────────── */
let regionOverlay   = null;
let controlBar      = null;   // the draggable control bar (hidden from recording)
let cameraWindow    = null;   // the floating camera feed (visible in recording)

let isRecording     = false;
let controlBarFrameDead = false; // true when render frame disposed before window destroyed

/* State for restart: remembers the last recording configuration */
let lastRecordingRegion    = null;
let lastRecordingFullscreen = false;
let lastRecordingSettings  = {};

/* ── Cursor position logger (for editor zoom feature) ────── */
let cursorTrack       = [];   // [{t, x, y}, ...]
let cursorTrackStart  = 0;    // Date.now() when recording started
let cursorTrackTimer  = null; // 10Hz interval
let cursorDisplayBounds = null; // {x, y, width, height} of the recorded area

function startCursorTracking(displayBounds) {
  cursorTrack = [];
  cursorTrackStart = Date.now();
  cursorDisplayBounds = displayBounds;
  if (cursorTrackTimer) clearInterval(cursorTrackTimer);
  cursorTrackTimer = setInterval(() => {
    const pt = screen.getCursorScreenPoint();
    cursorTrack.push({
      t: +(((Date.now() - cursorTrackStart) / 1000).toFixed(2)),
      x: pt.x, y: pt.y
    });
  }, 100); // 10 samples/sec — lightweight
}

function stopCursorTracking() {
  if (cursorTrackTimer) { clearInterval(cursorTrackTimer); cursorTrackTimer = null; }
}

function saveCursorTrack(videoFilePath) {
  if (!cursorTrack.length) return;
  try {
    const sidecarPath = videoFilePath.replace(/\.[^.]+$/, '.mictab-cursor.json');
    const data = { displayBounds: cursorDisplayBounds, track: cursorTrack };
    fs.writeFileSync(sidecarPath, JSON.stringify(data), 'utf8');
    console.log(`[ScreenRecorder] Cursor track saved (${cursorTrack.length} points)`);
  } catch (e) {
    console.error('[ScreenRecorder] Cursor track save failed:', e.message);
  }
  cursorTrack = [];
}

/* ── Mouse position broadcaster (60 fps) ───────────────────── */
let mousePollInterval = null;

function isControlBarFrameAlive() {
  if (!controlBar || controlBar.isDestroyed()) return false;
  if (controlBarFrameDead) return false;
  const wc = controlBar.webContents;
  if (!wc || wc.isDestroyed()) return false;
  // Check if the mainFrame is still valid — this is the most reliable
  // way to detect the "render frame disposed" state that Electron's
  // internal wc.send() hits.  Accessing mainFrame on a disposed frame
  // throws, while wc.isDestroyed() still returns false.
  try {
    const frame = wc.mainFrame;
    if (!frame) return false;
  } catch (_) {
    controlBarFrameDead = true;
    return false;
  }
  return true;
}

function startMouseBroadcast() {
  if (mousePollInterval) return; // already running
  controlBarFrameDead = false;
  mousePollInterval = setInterval(() => {
    if (!isControlBarFrameAlive()) {
      stopMouseBroadcast();
      return;
    }
    try {
      const pt = screen.getCursorScreenPoint();
      controlBar.webContents.send('srec-mouse-pos', pt.x, pt.y);
    } catch (_) {
      // Render frame disposed before window marked destroyed — stop cleanly
      controlBarFrameDead = true;
      stopMouseBroadcast();
    }
  }, 1000 / 60); // ~60 fps
}

function stopMouseBroadcast() {
  if (mousePollInterval) {
    clearInterval(mousePollInterval);
    mousePollInterval = null;
  }
}

/* ─────────────────────────────────────────────────────────
   REGION SELECTION OVERLAY
   ─────────────────────────────────────────────────────── */

function showRegionOverlay() {
  if (regionOverlay && !regionOverlay.isDestroyed()) {
    regionOverlay.close(); regionOverlay = null;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  regionOverlay = new BrowserWindow({
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
      preload: path.join(__dirname, '..', '..', 'ui', 'screen-recorder-region-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    regionOverlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    regionOverlay.setAlwaysOnTop(true, 'screen-saver');
    regionOverlay.setSimpleFullScreen(true);
  } else {
    regionOverlay.setFullScreen(true);
  }

  regionOverlay.loadFile(path.join(__dirname, '..', '..', 'ui', 'screen-recorder-region.html'));
  regionOverlay.on('closed', () => { regionOverlay = null; });
}

/* ─────────────────────────────────────────────────────────
   SAVED TOAST  (themed notification popup)
   ─────────────────────────────────────────────────────── */

function showSavedToast(filePath, filename, errorMsg) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw } = primaryDisplay.size;
  const bounds = primaryDisplay.bounds;
  const toastW = 340;
  const toastH = 70;

  const toast = new BrowserWindow({
    x: bounds.x + sw - toastW - 20,
    y: bounds.y + 20,
    width: toastW,
    height: toastH,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const isError = !!errorMsg;
  const title = isError ? 'Save Failed' : 'Recording Saved';
  const subtitle = isError ? errorMsg : filename;
  const iconColor = isError ? '#f87171' : '#4ade80';
  const iconPath = isError
    ? '<path d="M18 6 6 18M6 6l12 12"/>'
    : '<polyline points="20 6 9 17 4 12"/>';

  // Build inline HTML — Reveal button uses location.href to signal main process
  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:transparent;font-family:'Inter',-apple-system,sans-serif;overflow:hidden}
    .toast{display:flex;align-items:center;gap:10px;padding:12px 16px;
      background:rgba(10,10,18,0.92);backdrop-filter:blur(24px) saturate(180%);
      border:1px solid rgba(255,255,255,0.08);border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.45);animation:slideIn .3s ease}
    @keyframes slideIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
    .icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;
      background:rgba(${isError ? '239,68,68' : '74,222,128'},0.12);flex-shrink:0}
    .info{flex:1;min-width:0}
    .title{font:600 12px/1 Inter,sans-serif;color:#f0f0f5;margin-bottom:3px}
    .sub{font:400 10px/1.2 Inter,sans-serif;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .reveal{margin-left:auto;padding:5px 10px;border-radius:6px;
      background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);
      color:#a5b4fc;font:500 10px/1 sans-serif;cursor:pointer;white-space:nowrap;transition:background .15s}
    .reveal:hover{background:rgba(99,102,241,0.3)}
  </style></head><body>
    <div class="toast">
      <div class="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5">${iconPath}</svg></div>
      <div class="info"><div class="title">${title}</div><div class="sub">${subtitle}</div></div>
      ${filePath && !isError ? '<button class="reveal" onclick="location.href=\'reveal://open\'">Reveal</button>' : ''}
    </div>
  </body></html>`;

  toast.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  toast.once('ready-to-show', () => toast.show());

  // Intercept Reveal click
  if (filePath && !isError) {
    toast.webContents.on('will-navigate', (e, url) => {
      e.preventDefault();
      if (url.startsWith('reveal://')) {
        shell.showItemInFolder(filePath);
      }
    });
  }

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    if (toast && !toast.isDestroyed()) toast.destroy();
  }, 6000);
}

/* ─────────────────────────────────────────────────────────
   CONTROL BAR  (hidden from screen capture)
   ─────────────────────────────────────────────────────── */

// Pending settings from capture overlay — will be passed to openControlBar on region select
let pendingRecSettings = {};
let pendingOutputFormat = 'webm';
let pendingQuality = 'high';

async function openControlBar(region, fullscreen, settings = {}) {
  if (controlBar && !controlBar.isDestroyed()) {
    controlBar.close(); controlBar = null;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primaryDisplay.size;
  const sf = primaryDisplay.scaleFactor || 1;
  const bounds = primaryDisplay.bounds;

  // Determine the capture source
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1, height: 1 },
  });
  const screenSource = sources[0];

  // Multiply by scaleFactor to capture at native Retina resolution
  const fullW = Math.round(sw * sf);
  const fullH = Math.round(sh * sf);

  // For regional recording, scale the crop rectangle to physical pixels
  const capRegion = fullscreen
    ? { x: 0, y: 0, width: fullW, height: fullH }
    : {
        x: Math.round(region.x * sf),
        y: Math.round(region.y * sf),
        width: Math.round(region.width * sf),
        height: Math.round(region.height * sf),
      };

  // Control bar: ultra-compact pill, centred at bottom of screen
  // (No content protection — bar may appear in recordings, so keep it tiny)
  const barW = 210;
  const barH = 32;
  const barX = bounds.x + Math.round((sw - barW) / 2);
  const barY = bounds.y + sh - barH - 12;

  controlBar = new BrowserWindow({
    x: barX,
    y: barY,
    width: barW,
    height: barH,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    resizable: false,
    movable: true,         // user can drag the window
    focusable: true,
    show: false,           // show after content renders (avoids flash)
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'ui', 'screen-recorder-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  if (process.platform === 'darwin') {
    controlBar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    controlBar.setAlwaysOnTop(true, 'screen-saver');
    // NOTE: setContentProtection(true) is intentionally NOT used here.
    // On macOS Sequoia+ with transparent:true, it intermittently causes
    // the window to render as invisible (blank) — the camera shows but
    // the control bar buttons vanish.  The bar is kept small so it is
    // unobtrusive if it appears in a recording.
  }

  controlBar.loadFile(path.join(__dirname, '..', '..', 'ui', 'screen-recorder.html'));

  // ── Handle render process crash/disposal ──────────────────
  // When mic + system audio + camera all initialize together, the renderer
  // can occasionally crash.  Detect this and clean up so the user isn't
  // left with a dead invisible window and a spamming interval.
  controlBar.webContents.on('render-process-gone', (_event, details) => {
    console.error('[ScreenRecorder] Control bar render process gone:', details.reason);
    controlBarFrameDead = true;
    stopMouseBroadcast();
    stopCursorTracking();
    cursorTrack = [];
    closeCameraWindow();
    if (controlBar && !controlBar.isDestroyed()) {
      controlBar.destroy();
      controlBar = null;
    }
    isRecording = false;
  });

  controlBar.webContents.on('did-finish-load', () => {
    if (!controlBar || controlBar.isDestroyed()) return;

    // Show the window now that content has rendered
    controlBar.show();

    controlBar.webContents.send('srec-command', 'start');
    controlBar.webContents.send('srec-start-info', {
      sourceId: screenSource.id,
      region: capRegion,
      screenWidth: fullW,
      screenHeight: fullH,
      scaleFactor: sf,
      isFullScreen: !!fullscreen,
      quality: settings.quality || 'high',
      outputFormat: settings.outputFormat || 'webm',
      micOn: !!settings.micOn,
      micDeviceId: settings.micDeviceId || '',
      sysAudioOn: !!settings.sysAudioOn,
    });
    // Start mouse position broadcast at 60 fps for the animated cursor overlay
    startMouseBroadcast();
    // Start cursor position logging (10Hz) for editor zoom feature
    const display = screen.getPrimaryDisplay();
    startCursorTracking(fullscreen
      ? { x: 0, y: 0, width: display.size.width, height: display.size.height }
      : { x: region ? region.x : 0, y: region ? region.y : 0, width: region ? region.width : display.size.width, height: region ? region.height : display.size.height }
    );
    // Auto-open camera if user toggled it on in the capture overlay
    // Delay slightly more to let the recording pipeline fully initialize
    // before opening camera (avoids resource contention on macOS)
    if (settings.cameraOn) {
      setTimeout(() => {
        if (controlBar && !controlBar.isDestroyed() && !controlBarFrameDead) {
          openCameraWindow();
        }
      }, 800);
    }
  });


  controlBar.on('closed', () => {
    controlBar = null;
    controlBarFrameDead = true;
    isRecording = false;
    stopMouseBroadcast();
    stopCursorTracking();
    // Close camera window too if open
    if (cameraWindow && !cameraWindow.isDestroyed()) {
      cameraWindow.close(); cameraWindow = null;
    }
  });

  isRecording = true;
  pendingOutputFormat = settings.outputFormat || 'webm';
  pendingQuality = settings.quality || 'high';

  // Remember for restart
  lastRecordingRegion = region;
  lastRecordingFullscreen = !!fullscreen;
  lastRecordingSettings = { ...settings };
}

/* ─────────────────────────────────────────────────────────
   CAMERA WINDOW  (visible in screen capture)
   ─────────────────────────────────────────────────────── */

function openCameraWindow() {
  if (cameraWindow && !cameraWindow.isDestroyed()) return; // already open

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw } = primaryDisplay.size;
  const bounds = primaryDisplay.bounds;

  // Restore saved position, or default to top-right corner
  const savedCamPos = store.get('srecCameraPosition') || {};
  const camW = savedCamPos.w || 240;
  const camH = savedCamPos.h || 240;
  const camX = savedCamPos.x != null ? savedCamPos.x : bounds.x + sw - camW - 24;
  const camY = savedCamPos.y != null ? savedCamPos.y : bounds.y + 24;

  cameraWindow = new BrowserWindow({
    x: camX,
    y: camY,
    width: camW,
    height: camH,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    resizable: true,
    movable: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'ui', 'screen-recorder-camera-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    cameraWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    cameraWindow.setAlwaysOnTop(true, 'screen-saver');
    // DO NOT call setContentProtection(true) — camera must appear in recording
  }

  cameraWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'screen-recorder-camera.html'));

  // Save position & size on move/resize
  const saveCamBounds = () => {
    if (cameraWindow && !cameraWindow.isDestroyed()) {
      const b = cameraWindow.getBounds();
      store.set('srecCameraPosition', { x: b.x, y: b.y, w: b.width, h: b.height });
    }
  };
  cameraWindow.on('moved', saveCamBounds);
  cameraWindow.on('resize', saveCamBounds);

  cameraWindow.on('closed', () => {
    cameraWindow = null;
    // Notify control bar that camera was closed
    if (controlBar && !controlBar.isDestroyed() && controlBar.webContents && !controlBar.webContents.isDestroyed()) {
      controlBar.webContents.send('srec-command', 'camera-closed');
    }
  });
}

function closeCameraWindow() {
  if (cameraWindow && !cameraWindow.isDestroyed()) {
    cameraWindow.close(); cameraWindow = null;
  }
}

/* ─────────────────────────────────────────────────────────
   IPC HANDLERS
   ─────────────────────────────────────────────────────── */

function isScreenRecorderLocked() {
  const { checkScreenRecorderTrialExpiry } = require('./licensing');
  const trial = checkScreenRecorderTrialExpiry();
  return trial.expired;
}

function tryOpenScreenRecorder(action) {
  if (isScreenRecorderLocked()) {
    const { showScreenRecorderLockedPopup } = require('./window-manager');
    showScreenRecorderLockedPopup();
    return false;
  }
  action();
  return true;
}

function setupScreenRecorderIpc() {

  // ── Open from editor ─────────────────────────────────────────────────
  ipcMain.on('srec-open-from-editor', () => {
    console.log('[ScreenRecorder] Opening region selector');
    tryOpenScreenRecorder(() => showRegionOverlay());
  });

  // ── Open from capture overlay ("Record Region" button) ───────────────
  ipcMain.on('srec-open-from-capture', (e, settings) => {
    if (!tryOpenScreenRecorder(() => {
      pendingRecSettings = settings || {};
      ipcMain.emit('lens-capture-cancel');
      setTimeout(() => showRegionOverlay(), 150);
    })) {
      // Close the capture overlay so it doesn't block the lock popup
      ipcMain.emit('lens-capture-cancel');
    }
  });

  // ── Full screen from capture overlay ("Record Full Screen" button) ───
  ipcMain.on('srec-fullscreen-from-capture', (e, settings) => {
    if (!tryOpenScreenRecorder(() => {
      ipcMain.emit('lens-capture-cancel');
      setTimeout(() => openControlBar(null, true, settings || {}), 150);
    })) {
      ipcMain.emit('lens-capture-cancel');
    }
  });

  // ── Region selected ──────────────────────────────────────────────────
  ipcMain.on('srec-region-selected', (_, region) => {
    if (regionOverlay && !regionOverlay.isDestroyed()) regionOverlay.close();
    openControlBar(region, false, pendingRecSettings);
    pendingRecSettings = {};
  });

  // ── Full screen selected ─────────────────────────────────────────────
  ipcMain.on('srec-fullscreen-selected', () => {
    if (regionOverlay && !regionOverlay.isDestroyed()) regionOverlay.close();
    openControlBar(null, true);
  });

  // ── Cancel region selection ──────────────────────────────────────────
  ipcMain.on('srec-region-cancel', () => {
    if (regionOverlay && !regionOverlay.isDestroyed()) regionOverlay.close();
  });

  // ── Open camera window (separate from control bar) ───────────────────
  ipcMain.on('srec-open-camera', () => {
    openCameraWindow();
  });

  // ── Close camera window ──────────────────────────────────────────────
  ipcMain.on('srec-close-camera', () => {
    closeCameraWindow();
  });

  // ── Pause ────────────────────────────────────────────────────────────
  ipcMain.on('srec-pause-recording', () => {
    // Handled in renderer MediaRecorder directly
  });

  // ── Resume ───────────────────────────────────────────────────────────
  ipcMain.on('srec-resume-recording', () => {
    // Handled in renderer MediaRecorder directly
  });

  // ── Stop ─────────────────────────────────────────────────────────────
  ipcMain.on('srec-stop-recording', () => {
    // renderer handles MediaRecorder.stop() → sends srec-save-blob
  });

  // ── Cancel ───────────────────────────────────────────────────────────
  ipcMain.on('srec-cancel-recording', () => {
    stopMouseBroadcast();
    stopCursorTracking();
    cursorTrack = []; // discard on cancel
    controlBarFrameDead = true;
    closeCameraWindow();
    if (controlBar && !controlBar.isDestroyed()) {
      controlBar.destroy(); controlBar = null;
    }
    isRecording = false;
  });

  // ── Restart (discard current, start fresh with same settings) ────────
  ipcMain.on('srec-restart-recording', () => {
    stopMouseBroadcast();
    controlBarFrameDead = true;
    closeCameraWindow();
    if (controlBar && !controlBar.isDestroyed()) {
      controlBar.destroy(); controlBar = null;
    }
    isRecording = false;

    // Re-open with saved settings after a brief delay
    setTimeout(() => {
      controlBarFrameDead = false; // reset for new session
      openControlBar(
        lastRecordingRegion,
        lastRecordingFullscreen,
        lastRecordingSettings
      );
    }, 300);
  });

  // ── Save blob (Uint8Array binary from renderer) ───────────────────────
  ipcMain.handle('srec-save-blob', async (_, uint8Array) => {
    stopMouseBroadcast();
    stopCursorTracking();
    controlBarFrameDead = true;
    // IMMEDIATELY close control bar & camera so the UI doesn't appear to freeze
    closeCameraWindow();
    if (controlBar && !controlBar.isDestroyed()) {
      controlBar.destroy(); controlBar = null;
    }
    isRecording = false;

    // Capture format before it resets
    const outputFormat = pendingOutputFormat || 'webm';
    const recQuality = pendingQuality || 'high';
    pendingOutputFormat = 'webm';
    pendingQuality = 'high';

    try {
      const downloads = app.getPath('downloads');
      const saveDir = path.join(downloads, 'MicTab ScreenRec');
      if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `MicTab-Recording-${ts}.webm`;
      const filePath = path.join(saveDir, filename);

      const buf = Buffer.isBuffer(uint8Array) ? uint8Array : Buffer.from(uint8Array);
      fs.writeFileSync(filePath, buf);
      console.log(`[ScreenRecorder] Saved ${buf.length} bytes → ${filename}`);

      // Save cursor track sidecar for editor zoom feature
      saveCursorTrack(filePath);

      // Show toast and open gallery (always WebM — conversion from gallery)
      showSavedToast(filePath, filename);
      openGallery(filePath);

      return { ok: true, filePath };
    } catch (err) {
      console.error('[ScreenRecorder] Save failed:', err);
      showSavedToast(null, null, err.message);
      return { ok: false, error: err.message };
    }
  });

  // ── Camera device list (unused proxy — renderer uses native API) ──────
  ipcMain.handle('srec-get-cameras', async () => []);
}



module.exports = { setupScreenRecorderIpc, showRegionOverlay };
