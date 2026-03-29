const { app, Tray, Menu, globalShortcut, clipboard, BrowserWindow, nativeImage, ipcMain, shell, systemPreferences } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const robot = require('robotjs');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { autoUpdater } = require('electron-updater');
const { launchChromeBridge, closeChromeBridge } = require('./engine/chrome-launcher');
const store = require('./store/config');

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

const junoAutoLauncher = new AutoLaunch({
  name: 'Juno Global Voice',
  path: app.getPath('exe'),
});

// Windows fix for completely invisible or broken transparent windows
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

app.on('will-quit', async () => {
  await closeChromeBridge();
  globalShortcut.unregisterAll();
  try { uIOhook.stop(); } catch (e) {}
});

ipcMain.on('save-config', (event, config) => {
  store.set(config);
  registerHotkeys();   // re-register with new settings

  if (config.autoLaunch) {
    junoAutoLauncher.enable().catch(() => {});
  } else {
    junoAutoLauncher.disable().catch(() => {});
  }
});

ipcMain.handle('get-config', () => {
  return store.store;
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

// Overlay: inject punctuation — use typeString() to bypass clipboard entirely.
// This is the fix for the "glitch" where previous speech text would get re-pasted:
// typeString() simulates individual keystrokes, so it never reads/writes the clipboard.
ipcMain.on('inject-punct', (event, char) => {
  injectCharDirect(char);
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
  robustKeyTap('enter');
});

// Overlay: simulate Backspace key press  (⌫ — deletes character to the LEFT of cursor)
ipcMain.on('inject-backspace', () => {
  robustKeyTap('backspace');
});

// Overlay: keyboard shortcut actions (Cmd/Ctrl + key)
const KBD_MOD = process.platform === 'darwin' ? 'command' : 'control';
ipcMain.on('inject-select-all', () => { robustKeyTap('a', KBD_MOD); });
ipcMain.on('inject-copy',       () => { robustKeyTap('c', KBD_MOD); });
ipcMain.on('inject-cut',        () => { robustKeyTap('x', KBD_MOD); });
ipcMain.on('inject-paste',      () => { robustKeyTap('v', KBD_MOD); });
ipcMain.on('inject-undo',       () => { robustKeyTap('z', KBD_MOD); });

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
      } else {
        store.set('licenseStatus', 'active');
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
    focusable: false,                                         // CRITICAL: never steal focus
    type: process.platform === 'darwin' ? 'panel' : undefined, // macOS panel stays above without focus
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'ui', 'overlay-preload.js')
    }
  });

  overlayWindow.loadFile(path.join(__dirname, 'ui', 'overlay.html'));
  overlayWindow.on('closed', () => overlayWindow = null);
}

function createTray() {
  const isMac = process.platform === 'darwin';

  // macOS: use small template image (auto-adapts to light/dark menu bar)
  // Windows: use full-colour icon.png — template images show as invisible on Windows
  const iconPath = isMac
    ? path.join(__dirname, 'assets', 'iconTemplate.png')
    : path.join(__dirname, 'assets', 'icon.png');

  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    // Fallback: create a simple dot if the file is missing
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABRSURBVDiNY/z//z8DJYCJgUJANQMGBgYGJkombIoZGBgYmCixyIRGDRg1YNSAUQNGDaAqAMlnJGUzMo6A0QhGIxiNYDSC0Qj+B/8TAAD//wMAUhUWnwGUAAAAAElFTkSuQmCC');
  }

  if (isMac) {
    // Template image auto-adapts to light/dark menu bar — macOS only
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Start Listening', click: () => toggleListening() },
    { type: 'separator' },
    { label: 'Settings', click: () => showSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Juno Global Voice');
  tray.setContextMenu(contextMenu);
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

  settingsWindow = new BrowserWindow({
    width: 750,
    height: 520,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    resizable: false,
    maximizable: false,
    ...platformOptions,
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'settings-preload.js')
    }
  });

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
        } else if (data.type === 'error') {
          safeLog('Bridge Error:', data.message);
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
// Types the character(s) directly via OS key simulation, never touching the clipboard.
// This eliminates the race condition where a pending clipboard restore would corrupt
// an in-progress speech injection (causing the previous dictated text to be re-pasted).
function injectCharDirect(chars) {
  try {
    robot.typeString(chars);
  } catch (e) {
    // Fallback: clipboard paste for any char robot.typeString() can't handle
    safeLog('[injectCharDirect] typeString failed, falling back to clipboard:', e.message);
    injectText(chars);
  }
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

  const modifier = process.platform === 'darwin' ? 'command' : 'control';

  setTimeout(() => {
    try {
      robot.keyTap('v', modifier);
    } catch (e) {
      safeLog('[injectText] paste failed (likely non-en layout), falling back to typeString:', e.message);
      try {
        robot.setKeyboardDelay(0);
        robot.typeString(text);
      } catch (err2) {
        safeLog('[injectText] typeString fallback failed:', err2.message);
      }
    }
    // Restore the clipboard after a safe delay, but keep the timer reference
    // so any subsequent call can cancel this before it fires.
    clipRestoreTimer = setTimeout(() => {
      clipboard.writeText(originalClipboard);
      clipRestoreTimer = null;
    }, 600);
  }, 100);
}

function toggleListening() {
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
    overlayWindow.webContents.send('play-sound');
  }

  if (isListening) {
    lastPhraseTimestamp = 0;
    const lang = store.get('language') || 'en-US';
    const silenceTimeout = store.get('silenceTimeout') !== undefined ? store.get('silenceTimeout') : 15;
    
    if (overlayWindow) {
      overlayWindow.webContents.send('session-start', { lang });
      overlayWindow.showInactive();
      overlayWindow.center();
    }
    wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: silenceTimeout }));
  } else {
    if (overlayWindow) overlayWindow.hide();
    wsClient.send(JSON.stringify({ command: 'stop' }));
  }
  
  updateTrayMenu();
}

function updateTrayMenu() {
    const contextMenu = Menu.buildFromTemplate([
        { label: isListening ? 'Stop Listening' : 'Start Listening', click: () => toggleListening() },
        { type: 'separator' },
        { label: 'Settings', click: () => showSettings() },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setContextMenu(contextMenu);
}

// ── Hotkey system ─────────────────────────────────────────────
// Tracks hold-key state
let holdKeyTimer    = null;
let holdKeyPressed  = false;
let uiohookRunning  = false;

function registerHotkeys() {
  // 1) Combo shortcut
  globalShortcut.unregisterAll();
  const hotkeyEnabled = store.get('hotkeyEnabled') !== false;
  const hotkey        = store.get('hotkey') || 'Alt+V';

  if (hotkeyEnabled && hotkey) {
    try {
      globalShortcut.register(hotkey, () => toggleListening());
    } catch (e) {
      safeLog('Hotkey registration failed:', e.message);
    }
  }

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

app.on('will-quit', () => {
  if (uiohookRunning) {
    try {
      uIOhook.stop();
    } catch(e) {}
  }
  globalShortcut.unregisterAll();
});
