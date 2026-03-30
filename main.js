const { app, Tray, Menu, globalShortcut, clipboard, BrowserWindow, nativeImage, ipcMain, shell, systemPreferences, dialog, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const robot = require('robotjs');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { autoUpdater } = require('electron-updater');
const { launchChromeBridge, closeChromeBridge } = require('./engine/chrome-launcher');
const store = require('./store/config');

// ── Language list (shared with overlay UI) ────────────────────────
// Used by the tray language submenu.
const LANGUAGES = [
  { code:'en-US', name:'English (US)',    flag:'🇺🇸' },
  { code:'en-GB', name:'English (UK)',    flag:'🇬🇧' },
  { code:'en-CA', name:'English (CA)',    flag:'🇨🇦' },
  { code:'en-AU', name:'English (AU)',    flag:'🇦🇺' },
  { code:'es-ES', name:'Español (ES)',   flag:'🇪🇸' },
  { code:'es-MX', name:'Español (MX)',   flag:'🇲🇽' },
  { code:'fr-FR', name:'Français (FR)',  flag:'🇫🇷' },
  { code:'de-DE', name:'Deutsch (DE)',   flag:'🇩🇪' },
  { code:'it-IT', name:'Italiano (IT)',  flag:'🇮🇹' },
  { code:'pt-BR', name:'Português (BR)', flag:'🇧🇷' },
  { code:'pt-PT', name:'Português (PT)', flag:'🇵🇹' },
  { code:'ja-JP', name:'Japanese (JP)',  flag:'🇯🇵' },
  { code:'zh-CN', name:'Chinese (CN)',   flag:'🇨🇳' },
  { code:'ko-KR', name:'Korean (KR)',    flag:'🇰🇷' },
  { code:'ar-SA', name:'Arabic (SA)',    flag:'🇸🇦' },
  { code:'bn-BD', name:'Bengali (BD)',   flag:'🇧🇩' },
  { code:'hi-IN', name:'Hindi (IN)',     flag:'🇮🇳' },
  { code:'ru-RU', name:'Русский (RU)',   flag:'🇷🇺' },
  { code:'tr-TR', name:'Türkçe (TR)',    flag:'🇹🇷' },
  { code:'nl-NL', name:'Nederlands (NL)',flag:'🇳🇱' },
  { code:'pl-PL', name:'Polski (PL)',    flag:'🇵🇱' },
];

// Prevent Electron from crashing when stdout/stderr is a broken pipe (EIO)
// This globally wraps console.log/error so no matter where it's called, it won't crash the app.
const originalLog = console.log;
const originalError = console.error;
const safeWrap = (fn) => (...args) => {
  try { 
    fn(...args); 
  } catch (e) {
    if (e.code !== 'EIO') {
      try { process.stderr.write(String(e.stack || e)); } catch (p) {}
    }
  }
};
console.log = safeWrap(originalLog);
console.error = safeWrap(originalError);

function safeLog(...args) {
  console.log(...args);
}

const AutoLaunch = require('auto-launch');

let tray = null;
let settingsWindow = null;
let overlayWindow = null;
let wss = null;
let wsClient = null;
let isListening = false;
let httpPort = 9123;
let sessionWordCount = 0;  // resets each listening session
let currentSessionLang = 'en-US';

const junoAutoLauncher = new AutoLaunch({
  name: 'Juno Global Voice',
  path: app.getPath('exe'),
});

// Windows fix for completely invisible or broken transparent windows
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

app.on('will-quit', async (event) => {
  event.preventDefault(); // Pause quit loop to ensure cleanup completes
  if (uiohookRunning) {
    try {
      uIOhook.stop();
    } catch (e) {}
  }
  globalShortcut.unregisterAll();
  
  if (wsClient) {
    try { wsClient.terminate(); } catch (e) {}
  }
  
  try {
    await closeChromeBridge();
  } catch (e) {}
  
  app.exit(0); // Force clean exit
});

ipcMain.on('save-config', (event, config) => {
  store.set(config);
  registerHotkeys();   // re-register with new settings

  if (config.autoLaunch) {
    junoAutoLauncher.enable().catch(() => {});
  } else {
    junoAutoLauncher.disable().catch(() => {});
  }
  
  if (wsClient) {
    wsClient.send(JSON.stringify({ command: 'set-mic-sensitivity', sensitivity: config.micSensitivity || 1.0 }));
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('config-updated', config);
  }
});

// ── One-time migration: fix the old CommandOrControl+Shift+Space default ──
// Previous builds shipped with 'CommandOrControl+Shift+Space' as the default
// hotkey. This was inconsistent with the UI which showed 'Alt+V'. Both are now
// replaced with 'Alt+C'. If the old value is still stored, silently upgrade it.
(function migrateHotkey() {
  const BAD_DEFAULTS = ['CommandOrControl+Shift+Space', 'Alt+V'];
  const current = store.get('hotkey');
  if (BAD_DEFAULTS.includes(current)) {
    store.set('hotkey', 'Alt+C');
    safeLog('[Migration] Hotkey updated from', current, '→ Alt+C');
  }
})();

ipcMain.handle('get-config', () => {
  return store.store;
});

// Stats: return cumulative usage data to settings dashboard
ipcMain.handle('get-stats', () => ({
  totalWords:    store.get('statsWords')     || 0,
  totalSessions: store.get('statsSessions')  || 0,
  langUsage:     store.get('statsLangUsage') || {},
  firstDate:     store.get('statsFirstDate') || 0,
}));

// ── Export Text Replacements ────────────────────────────────────────────
ipcMain.handle('export-replacements', async (event) => {
  const replacements = store.get('textReplacements') || [];
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
    title: 'Export Text Replacements',
    defaultPath: 'juno-replacements.json',
    filters: [{ name: 'JSON File', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, reason: 'canceled' };
  try {
    const fs = require('fs');
    const payload = {
      schema: 1,
      exportedAt: new Date().toISOString(),
      replacements,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, count: replacements.length };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// ── Import Text Replacements ────────────────────────────────────────────
// Returns the parsed replacements to the renderer so it can show the
// merge/replace modal and decide which action to take before writing to store.
ipcMain.handle('import-replacements-pick', async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
    title: 'Import Text Replacements',
    filters: [{ name: 'JSON File', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || filePaths.length === 0) return { ok: false, reason: 'canceled' };
  try {
    const fs = require('fs');
    const raw  = fs.readFileSync(filePaths[0], 'utf8');
    const data = JSON.parse(raw);
    // Version-agnostic validation: only check schema field and array shape
    if (data.schema !== 1)                     return { ok: false, reason: 'invalid_schema' };
    if (!Array.isArray(data.replacements))     return { ok: false, reason: 'invalid_format' };
    // Sanitise: keep only {say, replace} string pairs
    const items = data.replacements
      .filter(r => typeof r.say === 'string' && typeof r.replace === 'string')
      .map(r => ({ say: r.say.trim(), replace: r.replace }));
    return { ok: true, items, count: items.length };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

// Commit the import choice (merge or replace) — called after user confirms in modal
ipcMain.handle('import-replacements-commit', (event, { items, mode }) => {
  if (!Array.isArray(items)) return { ok: false };
  if (mode === 'replace') {
    store.set('textReplacements', items);
  } else {
    // merge: add items whose 'say' phrase isn't already in the list
    const existing = store.get('textReplacements') || [];
    const existingKeys = new Set(existing.map(r => r.say.toLowerCase().trim()));
    const newItems = items.filter(r => !existingKeys.has(r.say.toLowerCase().trim()));
    store.set('textReplacements', [...existing, ...newItems]);
  }
  return { ok: true };
});

ipcMain.handle('app-factory-reset', () => {
  // Prevent trial bypassing and license loss
  const licenseKey = store.get('licenseKey');
  const licenseStatus = store.get('licenseStatus');
  const licensePurchase = store.get('licensePurchase');
  const firstLaunchDate = store.get('firstLaunchDate');

  store.clear();

  if (licenseKey !== undefined) store.set('licenseKey', licenseKey);
  if (licenseStatus !== undefined) store.set('licenseStatus', licenseStatus);
  if (licensePurchase !== undefined) store.set('licensePurchase', licensePurchase);
  if (firstLaunchDate !== undefined) store.set('firstLaunchDate', firstLaunchDate);

  if (wsClient) wsClient.terminate();
  if (uIOhook) uIOhook.stop();
  app.relaunch();
  app.quit();
});

// ── Mic Selector ─────────────────────────────────────────────────────────
// get-mic-list: sends get-devices to bridge and resolves with the device-list reply
// Uses a one-shot pending promise so we don't need a persistent event emitter.
let pendingMicListResolve = null;

ipcMain.handle('get-mic-list', () => {
  return new Promise((resolve) => {
    if (!wsClient) {
      // Bridge not connected yet — return empty list, UI shows placeholder
      resolve([]);
      return;
    }
    // If another request is already pending, resolve it immediately with []
    if (pendingMicListResolve) pendingMicListResolve([]);
    pendingMicListResolve = resolve;
    // Ask bridge to enumerate audio inputs
    wsClient.send(JSON.stringify({ command: 'get-devices' }));
    // Safety timeout: if bridge doesn't respond in 3s, resolve empty
    setTimeout(() => {
      if (pendingMicListResolve === resolve) {
        pendingMicListResolve = null;
        resolve([]);
      }
    }, 3000);
  });
});

ipcMain.on('set-mic', (event, deviceId) => {
  // Persist selection
  store.set('selectedMicId', deviceId || '');
  // Tell bridge immediately if connected — takes effect on next start
  if (wsClient) {
    wsClient.send(JSON.stringify({ command: 'set-device', deviceId: deviceId || null }));
  }
});

// Settings: suspend ALL global shortcuts so the window can capture raw keystrokes
// Called when user enters hotkey recording mode — otherwise globalShortcut
// intercepts the keypress at OS level before the renderer window sees it.
ipcMain.on('suspend-hotkeys', () => {
  globalShortcut.unregisterAll();
  // Also pause hold-key detection
  uIOhook.removeAllListeners('keydown');
  uIOhook.removeAllListeners('keyup');
  safeLog('[Hotkeys] Suspended for recording');
});

// Settings: re-register everything after recording is done or cancelled
ipcMain.on('resume-hotkeys', () => {
  registerHotkeys();
  safeLog('[Hotkeys] Resumed');
});

// Overlay: stop button clicked
ipcMain.on('overlay-stop', () => {
  if (isListening) toggleListening();
});

// Helper to keep the microphone active when user interacts with the UI
function resetSilenceTimer() {
  if (wsClient && isListening) {
    wsClient.send(JSON.stringify({ command: 'ping' }));
  }
}

// Overlay: inject punctuation — use typeString() to bypass clipboard entirely.
// This is the fix for the "glitch" where previous speech text would get re-pasted:
// typeString() simulates individual keystrokes, so it never reads/writes the clipboard.
ipcMain.on('inject-punct', (event, char) => {
  resetSilenceTimer();
  injectCharDirect(char);
});

// Settings: Open settings from overlay button
ipcMain.on('open-settings', () => {
  resetSilenceTimer();
  showSettings();
});

// Overlay: toggle mini/pill mode
// Resizes window + saves state + swaps saved positions
ipcMain.on('set-mini-mode', (event, isMini) => {
  if (!overlayWindow) return;

  const FULL_W = 420, FULL_H = 312;
  const MINI_W = 280, MINI_H = 38;

  // Save the position we're LEAVING
  const pos = overlayWindow.getPosition();
  if (isMini) {
    store.set('overlayPosition', { x: pos[0], y: pos[1] });
  } else {
    store.set('overlayMiniPosition', { x: pos[0], y: pos[1] });
  }

  // Persist new mode
  store.set('overlayMini', isMini);

  // Resize
  overlayWindow.setResizable(true);
  overlayWindow.setMinimumSize(isMini ? MINI_W : FULL_W, isMini ? MINI_H : FULL_H);
  overlayWindow.setSize(isMini ? MINI_W : FULL_W, isMini ? MINI_H : FULL_H);
  overlayWindow.setResizable(false);

  // Restore the saved position for the mode we're ENTERING
  const savedPos = isMini
    ? store.get('overlayMiniPosition')
    : store.get('overlayPosition');
  if (savedPos && typeof savedPos.x === 'number') {
    overlayWindow.setPosition(savedPos.x, savedPos.y);
  }
});

// Overlay: simulate Enter/Return key press  (↵ — moves to next line)
function robustKeyTap(key, modifier) {
  try {
    if (process.platform === 'darwin') {
      if (modifier) {
        const mods = Array.isArray(modifier) ? modifier : [modifier];
        robot.keyTap(key, mods);
      } else {
        robot.keyTap(key);
      }
    } else {
      if (modifier) {
        if (Array.isArray(modifier)) modifier.forEach(m => robot.keyToggle(m, 'down'));
        else robot.keyToggle(modifier, 'down');
      }
      robot.keyToggle(key, 'down');
      // Minimal delay allows OS input buffer to process the synthetic keys
      setTimeout(() => {
        robot.keyToggle(key, 'up');
        if (modifier) {
          if (Array.isArray(modifier)) modifier.forEach(m => robot.keyToggle(m, 'up'));
          else robot.keyToggle(modifier, 'up');
        }
      }, 15);
    }
  } catch(e) { safeLog('robustKeyTap error:', e.message); }
}

ipcMain.on('inject-enter', () => {
  resetSilenceTimer();
  robustKeyTap('enter');
});

// Overlay: simulate Backspace key press  (⌫ — deletes character to the LEFT of cursor)
ipcMain.on('inject-backspace', () => {
  resetSilenceTimer();
  robustKeyTap('backspace');
});

// Overlay: keyboard shortcut actions (Cmd/Ctrl + key)
const KBD_MOD = process.platform === 'darwin' ? 'command' : 'control';
ipcMain.on('inject-select-all', () => { resetSilenceTimer(); robustKeyTap('a', KBD_MOD); });
ipcMain.on('inject-copy',       () => { resetSilenceTimer(); robustKeyTap('c', KBD_MOD); });
ipcMain.on('inject-cut',        () => { resetSilenceTimer(); robustKeyTap('x', KBD_MOD); });
ipcMain.on('inject-paste',      () => { resetSilenceTimer(); robustKeyTap('v', KBD_MOD); });
ipcMain.on('inject-undo',       () => { resetSilenceTimer(); robustKeyTap('z', KBD_MOD); });

// Overlay: user changed language from the language picker
ipcMain.on('overlay-change-language', (event, lang) => {
  store.set('language', lang);
  const silenceTimeout = store.get('silenceTimeout') !== undefined ? store.get('silenceTimeout') : 15;
  // Tell the bridge to switch language (restart recognition with new lang)
  if (wsClient && isListening) {
    wsClient.send(JSON.stringify({ command: 'stop' }));
    setTimeout(() => {
      if (isListening && wsClient) {
        wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: silenceTimeout }));
      }
    }, 200);
  }
  // Also notify settings window if it's open
  if (settingsWindow) {
    settingsWindow.webContents.send('language-changed', lang);
  }
});

// Overlay: toggle favorite language
ipcMain.on('toggle-favorite', (event, langCode) => {
  let favs = store.get('favorites') || [];
  if (favs.includes(langCode)) {
    favs = favs.filter(c => c !== langCode);
  } else {
    favs.push(langCode);
  }
  store.set('favorites', favs);
});

// Settings / Overlay: open external URLs securely
ipcMain.on('open-url', (event, url) => {
  shell.openExternal(url);
});

// ── Licensing & Trial Logic ───────────────────────────────────
ipcMain.handle('verify-license', async (event, key) => {
  try {
    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: 'LpMFpNqkVgE8E0V8o-Q92w==',
        license_key: key,
        increment_uses_count: 'true'
      })
    });
    const data = await response.json();
    
    if (data.success) {
      store.set('licenseKey', key);
      store.set('licenseStatus', 'active');
      if (data.purchase) store.set('licensePurchase', data.purchase);
      return { success: true, message: 'License verified successfully!' };
    } else {
      store.set('licenseStatus', 'expired');
      return { success: false, message: data.message || 'Invalid or expired key.' };
    }
  } catch (err) {
    safeLog('Gumroad verification err:', err);
    return { success: false, message: 'Server error. Please check your internet connection and try again.' };
  }
});

async function checkAuthStatus() {
  const key = store.get('licenseKey');
  if (key) {
    try {
      // Background check without incrementing use count
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: 'LpMFpNqkVgE8E0V8o-Q92w==',
          license_key: key,
          increment_uses_count: 'false'
        })
      });
      const data = await response.json();
      if (!data.success) {
        store.set('licenseStatus', 'expired');
        store.set('licensePurchase', {});
      } else {
        store.set('licenseStatus', 'active');
        if (data.purchase) store.set('licensePurchase', data.purchase);
      }
    } catch (e) {
      // If offline, trust the last known good state
    }
  } else {
    // 7-day Trial logic
    let firstLaunch = store.get('firstLaunchDate');
    if (!firstLaunch || firstLaunch === 0) {
      firstLaunch = Date.now();
      store.set('firstLaunchDate', firstLaunch);
    }
    const daysUsed = (Date.now() - firstLaunch) / (1000 * 60 * 60 * 24);
    if (daysUsed > 7) {
      store.set('licenseStatus', 'expired');
    } else {
      store.set('licenseStatus', 'trial');
    }
  }
}

// ── Auto Updater logic ────────────────────────────────────────
autoUpdater.autoDownload = false; 

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.on('check-updates', () => autoUpdater.checkForUpdates());
ipcMain.on('download-update', () => autoUpdater.downloadUpdate());
ipcMain.on('install-update', () => autoUpdater.quitAndInstall());

autoUpdater.on('update-available', (info) => {
  if (settingsWindow) settingsWindow.webContents.send('update-status', { type: 'available', version: info.version });
});
autoUpdater.on('update-not-available', () => {
  if (settingsWindow) settingsWindow.webContents.send('update-status', { type: 'not-available' });
});
autoUpdater.on('error', (err) => {
  if (settingsWindow) settingsWindow.webContents.send('update-status', { type: 'error', message: err.message });
});
autoUpdater.on('download-progress', (progressObj) => {
  if (settingsWindow) settingsWindow.webContents.send('update-status', { type: 'progress', percent: progressObj.percent });
});
autoUpdater.on('update-downloaded', () => {
  if (settingsWindow) settingsWindow.webContents.send('update-status', { type: 'downloaded' });
});

let lastPhraseTimestamp = 0; // For smart spacing between pauses

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: 420,
    height: 312,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    hasShadow: true,
    focusable: false,                                          // CRITICAL: never steal focus
    type: process.platform === 'darwin' ? 'panel' : undefined, // macOS: NSPanel with NSNonactivatingPanelMask
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'ui', 'overlay-preload.js')
    }
  });

  // macOS safety net: if the overlay somehow gains focus (e.g. Electron internals),
  // immediately release it so the dictation target app keeps its active status.
  if (process.platform === 'darwin') {
    overlayWindow.on('focus', () => {
      overlayWindow.blur();
    });
  }

  overlayWindow.loadFile(path.join(__dirname, 'ui', 'overlay.html'));
  
  // Position Lock: Save whenever user drags window
  overlayWindow.on('moved', () => {
    const pos = overlayWindow.getPosition();
    store.set('overlayPosition', { x: pos[0], y: pos[1] });
  });

  overlayWindow.on('closed', () => overlayWindow = null);
}

function createTray() {
  const isMac = process.platform === 'darwin';

  const updateTrayIcon = () => {
    let iconPath;

    if (isMac) {
      // macOS handles light/dark dynamically if the filename ends with "Template.png"
      // You can replace "assets/iconTemplate.png" with your resized image.
      iconPath = path.join(__dirname, 'assets', 'iconTemplate.png');
    } else {
      // Windows needs explicit swapping between black and white logo files
      if (nativeTheme.shouldUseDarkColors) {
        iconPath = path.join(__dirname, 'assets', 'logo', 'transparent-white-logo.png'); // White logo for Dark taskbar
      } else {
        iconPath = path.join(__dirname, 'assets', 'logo', 'transparent-black-logo.png'); // Black logo for Light taskbar
      }
    }

    let icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fallback simple dot
      icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABRSURBVDiNY/z//z8DJYCJgUJANQMGBgYGJkombIoZGBgYmCixyIRGDRg1YNSAUQNGDaAqAMlnJGUzMo6A0QhGIxiNYDSC0Qj+B/8TAAD//wMAUhUWnwGUAAAAAElFTkSuQmCC');
    }

    if (isMac) {
      icon.setTemplateImage(true);
    }

    if (tray) {
      tray.setImage(icon);
    } else {
      tray = new Tray(icon);
    }
  };

  updateTrayIcon();
  nativeTheme.on('updated', () => {
    if (tray) updateTrayIcon();
  });

  tray.setToolTip('Juno Global Voice');
  updateTrayMenu();
}

function showSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const isMac = process.platform === 'darwin';

  // vibrancy, visualEffectState, and titleBarStyle:'hiddenInset' are macOS-only.
  // On Windows, they either silently fail or cause rendering glitches, so we
  // only apply them on macOS. The glass aesthetic is preserved via CSS on Windows.
  const platformOptions = isMac
    ? {
        titleBarStyle: 'hiddenInset',
        vibrancy: 'sidebar',
        visualEffectState: 'active',
        backgroundColor: '#00000000',
      }
    : {
        titleBarStyle: 'default',
        backgroundColor: '#1a1a2e', // dark fallback so glass CSS still looks good
        autoHideMenuBar: true,
      };

  const savedPos = store.get('settingsPosition');
  const posOptions = savedPos ? { x: savedPos.x, y: savedPos.y } : {};

  settingsWindow = new BrowserWindow({
    width: 750,
    height: 520,
    ...posOptions,
    icon: path.join(__dirname, 'assets', 'logo', 'dark-logo-solid-black-background.png'),
    resizable: false,
    maximizable: false,
    ...platformOptions,
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'settings-preload.js')
    }
  });

  settingsWindow.on('moved', () => {
    if (settingsWindow) {
      const [x, y] = settingsWindow.getPosition();
      store.set('settingsPosition', { x, y });
    }
  });

  // ── macOS focus fix ────────────────────────────────────────────
  // Creating a standard BrowserWindow silently resets the macOS activation
  // policy from 'accessory' back to 'regular', making Juno the frontmost app.
  // When Juno is 'regular-active', clicking the overlay causes the dictation
  // target to lose focus. Re-apply 'accessory' immediately after window creation.
  if (isMac) {
    setImmediate(() => app.setActivationPolicy('accessory'));
    // Also restore after settings closes, as the closing event can reset it.
    settingsWindow.on('closed', () => {
      setImmediate(() => app.setActivationPolicy('accessory'));
    });
  }

  settingsWindow.loadFile('ui/settings.html');
  settingsWindow.on('closed', () => settingsWindow = null);
}

function setupHttpServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/speech-bridge.html')) {
      const filePath = path.join(__dirname, 'engine', 'speech-bridge.html');
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading speech-bridge.html');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(0, 'localhost', () => {
    httpPort = server.address().port;
    safeLog(`HTTP Server listening on http://localhost:${httpPort}`);
    setupWebSocketServer(server);
    
    const bridgeUrl = `http://localhost:${httpPort}/speech-bridge.html?port=${httpPort}`;
    
    // Lock to prevent multiple launches during race conditions
    if (launchChromeBridge.isLaunching) return;
    launchChromeBridge.isLaunching = true;
    
    launchChromeBridge(bridgeUrl).catch(err => {
      safeLog('Failed to launch Chrome bridge:', err);
    }).finally(() => {
      launchChromeBridge.isLaunching = false;
    });
  });
}

function setupWebSocketServer(server) {
  wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    safeLog('Bridge connected via WebSocket');
    wsClient = ws;

    // Restore saved mic preference — bridge applies it on next start command
    const savedMicId = store.get('selectedMicId') || '';
    if (savedMicId) {
      ws.send(JSON.stringify({ command: 'set-device', deviceId: savedMicId }));
    }
    
    // Restore mic sensitivity
    const savedSensitivity = store.get('micSensitivity');
    if (savedSensitivity !== undefined) {
      ws.send(JSON.stringify({ command: 'set-mic-sensitivity', sensitivity: savedSensitivity }));
    }
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'final-text') {
          let rawText = data.text;

          // ── Text Replacement Feature ──
          const isReplaceEnabled = store.get('textReplaceEnabled');
          if (isReplaceEnabled) {
            const rules = store.get('textReplacements') || [];
            
            // Normalize string for exact matching by removing leading/trailing punctuation and whitespace
            const normalize = (str) => {
              return (str || '').toLowerCase()
                                .replace(/^[.,?!;:'"()\[\]{}-]+|[.,?!;:'"()\[\]{}-]+$/g, '')
                                .trim();
            };
            
            const normalizedRawText = normalize(rawText);

            for (const rule of rules) {
              if (rule.say && rule.say.trim() !== '') {
                const normalizedSay = normalize(rule.say);
                if (normalizedRawText === normalizedSay) {
                  // Complete exact match found. Replace the entire utterance.
                  rawText = rule.replace || '';
                  break; // Only match one rule since it's an exact phrase scenario
                }
              }
            }
          }

          // ── Stats tracking ───────────────────────────────────────────
          const wordCount = data.text.trim().split(/\s+/).filter(Boolean).length;
          sessionWordCount += wordCount;

          // Persist cumulative word count
          store.set('statsWords', (store.get('statsWords') || 0) + wordCount);

          // Persist language breakdown
          const currentLang = currentSessionLang || store.get('language') || 'en-US';
          const langUsage   = store.get('statsLangUsage') || {};
          langUsage[currentLang] = (langUsage[currentLang] || 0) + wordCount;
          store.set('statsLangUsage', langUsage);

          // Send live session word count to overlay
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('session-word-count', sessionWordCount);
          }

          // Smart spacing: add a space between phrases when user paused
          const now = Date.now();
          const pausedLongEnough = (now - lastPhraseTimestamp) > 400; // >400ms gap = natural pause
          const textToInject = (lastPhraseTimestamp > 0 && pausedLongEnough) 
            ? ' ' + rawText  // prepend space after a pause
            : rawText;
          lastPhraseTimestamp = now;
          
          injectText(textToInject);
          
          // Also forward to overlay for display
          if (overlayWindow) {
            overlayWindow.webContents.send('transcript', { text: data.text });
          }
        } else if (data.type === 'interim-text') {
          // Forward interim to overlay for live typing effect
          if (overlayWindow) {
            overlayWindow.webContents.send('interim-text', data.text);
          }
        } else if (data.type === 'status') {
          safeLog('Bridge Status:', data.message);
          if (data.message === 'silence-timeout' && isListening) {
            toggleListening(); // Synchronize Electron status
            if (overlayWindow) overlayWindow.webContents.send('overlay-status', 'silence-timeout');
          }
        } else if (data.type === 'device-list') {
          // Bridge responded to get-devices command — relay to pending IPC promise
          if (pendingMicListResolve) {
            pendingMicListResolve(data.devices || []);
            pendingMicListResolve = null;
          }
        } else if (data.type === 'error') {
          safeLog('Bridge Error:', data.message);
        } else if (data.type === 'audio-data') {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('audio-data', { bins: data.bins, volume: data.volume });
          }
        }
      } catch (e) {
        safeLog('WebSocket message parsing error:', e);
      }
    });
    
    ws.on('close', () => {
      wsClient = null;
    });
  });
}

// Tracks any pending clipboard-restore so we can cancel it before starting a new injection.
let clipRestoreTimer = null;

// injectCharDirect — for punctuation buttons.
// On Windows, robot.typeString can cause double-typing issues in certain apps
// like Telegram. So we use injectText (clipboard paste) universally on Windows.
// On macOS, typeString works fine for ASCII characters.
function injectCharDirect(chars) {
  if (process.platform === 'win32') {
    injectText(chars);
    return;
  }

  const isAsciiOnly = /^[\x00-\x7F]+$/.test(chars);
  if (isAsciiOnly) {
    try {
      robot.typeString(chars);
      return;
    } catch (e) {
      safeLog('[injectCharDirect] typeString failed, falling back to clipboard:', e.message);
    }
  }
  // Non-ASCII or typeString failure → clipboard paste (same as long speech text)
  injectText(chars);
}

// injectText — for dictated speech (potentially long strings).
// Uses clipboard paste for speed; cancels any in-flight restore before touching the clipboard.
function injectText(text) {
  // Cancel any pending clipboard restore from a previous call to avoid race conditions
  if (clipRestoreTimer) {
    clearTimeout(clipRestoreTimer);
    clipRestoreTimer = null;
  }

  const originalClipboard = clipboard.readText();
  clipboard.writeText(text);

  // On Windows, robot.keyTap('v', 'control') is unreliable — the Ctrl modifier can
  // be dropped by the OS, causing Windows to only register bare 'V' presses,
  // which results in only the first character of the clipboard being "typed" repeatedly.
  // We use keyToggle with an explicit delay (same pattern as robustKeyTap) to ensure
  // Ctrl is properly held down before and released after V fires.
  if (process.platform === 'win32') {
    setTimeout(() => {
      try {
        robot.keyToggle('control', 'down');
        setTimeout(() => {
          try {
            robot.keyToggle('v', 'down');
            setTimeout(() => {
              robot.keyToggle('v', 'up');
              robot.keyToggle('control', 'up');
            }, 30);
          } catch (e) {
            robot.keyToggle('control', 'up'); // always release modifier
            safeLog('[injectText] Windows keyToggle v failed:', e.message);
            // Fallback: typeString (slow but reliable)
            try { robot.typeString(text); } catch (err2) {
              safeLog('[injectText] typeString fallback also failed:', err2.message);
            }
          }
          // Restore clipboard after paste completes
          clipRestoreTimer = setTimeout(() => {
            clipboard.writeText(originalClipboard);
            clipRestoreTimer = null;
          }, 700);
        }, 30);
      } catch (e) {
        safeLog('[injectText] Windows Ctrl-down failed:', e.message);
        try { robot.typeString(text); } catch (err2) {}
      }
    }, 120);
  } else {
    // macOS: robot.keyTap with 'command' modifier is fully reliable
    setTimeout(() => {
      try {
        robot.keyTap('v', 'command');
      } catch (e) {
        safeLog('[injectText] macOS paste failed, falling back to typeString:', e.message);
        try {
          robot.setKeyboardDelay(0);
          robot.typeString(text);
        } catch (err2) {
          safeLog('[injectText] typeString fallback failed:', err2.message);
        }
      }
      // Restore the clipboard after a safe delay
      clipRestoreTimer = setTimeout(() => {
        clipboard.writeText(originalClipboard);
        clipRestoreTimer = null;
      }, 600);
    }, 100);
  }
}

function toggleListening(forceLang = null) {
  if (!wsClient) {
    shell.beep();
    dialog.showErrorBox(
      'Service Not Ready',
      'The speech recognition service is not connected yet. If this persists, restart the app or ensure Chrome is installed.'
    );
    return;
  }
  
  // Enforce Licensing/Trial Check
  const status = store.get('licenseStatus');
  if (status === 'expired') {
    shell.beep();
    showSettings();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('license-expired');
    }
    return;
  }
  
  isListening = !isListening;

  // Play the sound on toggle (start, manual stop, or silence-timeout stop)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('play-sound', isListening);
  }

  if (isListening) {
    // Reset per-session word counter
    sessionWordCount = 0;

    // Record first-use date if not already set
    if (!store.get('statsFirstDate')) {
      store.set('statsFirstDate', Date.now());
    }

    // Increment session count
    store.set('statsSessions', (store.get('statsSessions') || 0) + 1);
    lastPhraseTimestamp = 0;
    const lang = forceLang || store.get('language') || 'en-US';
    currentSessionLang = lang;
    const silenceTimeout = store.get('silenceTimeout') !== undefined ? store.get('silenceTimeout') : 15;
    const isMini = store.get('overlayMini') || false;
    const FULL_W = 420, FULL_H = 312;
    const MINI_W = 280, MINI_H = 38;

    if (overlayWindow) {
      overlayWindow.webContents.send('session-start', { lang });
      // Apply the correct window size for the current mode
      overlayWindow.setResizable(true);
      overlayWindow.setMinimumSize(isMini ? MINI_W : FULL_W, isMini ? MINI_H : FULL_H);
      overlayWindow.setSize(isMini ? MINI_W : FULL_W, isMini ? MINI_H : FULL_H);
      overlayWindow.setResizable(false);
      overlayWindow.showInactive();

      const posKey = isMini ? 'overlayMiniPosition' : 'overlayPosition';
      const pos = store.get(posKey);
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        overlayWindow.setPosition(pos.x, pos.y);
      } else {
        overlayWindow.center();
      }
    }
    wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: silenceTimeout }));
  } else {
    if (overlayWindow) overlayWindow.hide();
    wsClient.send(JSON.stringify({ command: 'stop' }));
  }
  
  updateTrayMenu();
}

function updateTrayMenu() {
  const currentLang = store.get('language') || 'en-US';
  const isMac = process.platform === 'darwin';

  // Build language submenu dynamically
  const langSubmenu = LANGUAGES.map(lang => {
    // On Windows, emoji flags may not render in native menus — use text code fallback
    const label = isMac
      ? `${lang.flag}  ${lang.name}`
      : `[${lang.code.split('-')[1]}] ${lang.name}`;
    return {
      label,
      type: 'radio',
      checked: lang.code === currentLang,
      click: () => switchTrayLanguage(lang.code)
    };
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: isListening ? 'Stop Listening' : 'Start Listening', click: () => toggleListening() },
    { type: 'separator' },
    {
      label: 'Language',
      submenu: langSubmenu
    },
    { type: 'separator' },
    { label: 'Settings', click: () => showSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

// Switch language from the tray submenu
function switchTrayLanguage(langCode) {
  store.set('language', langCode);
  const silenceTimeout = store.get('silenceTimeout') !== undefined ? store.get('silenceTimeout') : 15;

  // Notify overlay UI so the language pill label updates
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('set-language', langCode);
  }
  // Notify settings window if open
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('language-changed', langCode);
  }
  // If currently listening, restart recognition in the new language
  if (isListening && wsClient) {
    wsClient.send(JSON.stringify({ command: 'stop' }));
    setTimeout(() => {
      if (isListening && wsClient) {
        wsClient.send(JSON.stringify({ command: 'start', language: langCode, timeout: silenceTimeout }));
      }
    }, 200);
  }
  updateTrayMenu(); // refresh checkmarks
}

// ── Hotkey system ─────────────────────────────────────────────
// Tracks hold-key state
let holdKeyTimer    = null;
let holdKeyPressed  = false;
let uiohookRunning  = false;

function registerHotkeys() {
  // 1) Combo shortcut (Global)
  globalShortcut.unregisterAll();
  const hotkeyEnabled = store.get('hotkeyEnabled') !== false;
  const hotkey        = store.get('hotkey') || 'Alt+C';

  if (hotkeyEnabled && hotkey) {
    try {
      globalShortcut.register(hotkey, () => toggleListening());
    } catch (e) {
      safeLog('Hotkey registration failed:', e.message);
    }
  }

  // 1b) Language-specific Combo Hotkeys
  const langHotkeys = store.get('langHotkeys') || [];
  langHotkeys.forEach((lh) => {
    if (lh.combo && lh.lang) {
      // Don't register if it's identical to the global hotkey (prevents conflict)
      if (lh.combo === hotkey && hotkeyEnabled) return;
      try {
        globalShortcut.register(lh.combo, () => toggleListening(lh.lang));
      } catch (e) {
        safeLog(`Lang Hotkey registration failed for ${lh.combo}:`, e.message);
      }
    }
  });

  // 2) Hold-key via uiohook-napi
  const holdEnabled  = store.get('holdKeyEnabled') === true;
  let holdKeyName    = store.get('holdKey');
  if (holdKeyName === undefined || holdKeyName === '') {
    holdKeyName = 'Alt';
  }
  const holdDuration = (store.get('holdDuration') || 2) * 1000; // convert to ms

  // Remove old listeners before adding new ones
  uIOhook.removeAllListeners('keydown');
  uIOhook.removeAllListeners('keyup');

  if (holdEnabled && holdKeyName) {
    uIOhook.on('keydown', (e) => {
      const pressed = uiohookKeyName(e.keycode);
      if (pressed !== holdKeyName) return;
      if (holdKeyPressed) return;   // already counting down
      holdKeyPressed = true;
      holdKeyTimer = setTimeout(() => {
        toggleListening();
      }, holdDuration);
    });

    uIOhook.on('keyup', (e) => {
      const released = uiohookKeyName(e.keycode);
      if (released !== holdKeyName) return;
      holdKeyPressed = false;
      if (holdKeyTimer) {
        clearTimeout(holdKeyTimer);
        holdKeyTimer = null;
      }
    });
  }

  // Start uiohook if not already running
  if (!uiohookRunning) {
    try {
      uIOhook.start();
      uiohookRunning = true;
    } catch (e) {
      safeLog('uiohook start failed:', e.message);
    }
  }
}

// Map uiohook keycodes back to readable names
function uiohookKeyName(keycode) {
  // Build reverse map from UiohookKey
  if (!uiohookKeyName._map) {
    uiohookKeyName._map = {};
    for (const [name, code] of Object.entries(UiohookKey)) {
      uiohookKeyName._map[code] = name;
    }
  }
  return uiohookKeyName._map[keycode] || String(keycode);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide();
    // CRITICAL: Set activation policy to 'accessory' so Juno NEVER becomes the
    // frontmost application when its windows are clicked. Without this, clicking
    // the overlay steals focus from the dictation target.
    // Note: dock.hide() alone is NOT sufficient — creating any BrowserWindow
    // silently resets the policy back to 'regular', so we must set it explicitly.
    app.setActivationPolicy('accessory');

    // Request accessibility permissions so robotjs can paste/inject text
    try {
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(true);
      safeLog('macOS Accessibility Trusted: ', isTrusted);
      if (!isTrusted) {
        dialog.showErrorBox(
          'Accessibility Permission Required',
          'Juno Global Voice needs Accessibility permissions to type text into other applications automatically.\n\nPlease go to System Settings -> Privacy & Security -> Accessibility, check the box next to Juno Global Voice, and then restart this application.'
        );
      }
    } catch (e) {
      safeLog('Error requesting Accessibility:', e);
    }
  }
  
  checkAuthStatus(); // Validate trial & license key securely on startup
  
  const autoLaunch = store.get('autoLaunch');
  if (autoLaunch) {
    junoAutoLauncher.enable().catch(() => {});
  } else if (autoLaunch === false) {
    junoAutoLauncher.disable().catch(() => {});
  }

  createTray();
  createOverlay();
  registerHotkeys();
  setupHttpServer();

  // Show UI on startup so user sees the new dashboard
  setTimeout(() => {
    showSettings();
  }, 1000);
});

