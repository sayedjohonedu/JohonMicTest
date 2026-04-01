const { app, globalShortcut, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const robot = require('robotjs');
const AutoLaunch = require('auto-launch');

const store = require('./store/config');
const { launchChromeBridge, closeChromeBridge } = require('./engine/chrome-launcher');
const clipboardManager = require('./src/main/clipboard-manager');

// Import modules
const { createOverlay, showSettings, applyOverlaySize, getOverlayWindow, getSettingsWindow } = require('./src/main/window-manager');
const { registerHotkeys, stopUiohook } = require('./src/main/hotkey-manager');
const { checkAuthStatus } = require('./src/main/licensing');
const { setupUpdater } = require('./src/main/updater');
const { setupIpcHandlers } = require('./src/main/ipc-handlers');
const { createTray, updateTrayMenu } = require('./src/main/tray-manager');

// Global state
let wss = null;
let wsClient = null;
let isListening = false;
let httpPort = 9123;
let sessionWordCount = 0;
let currentSessionLang = 'en-US';
let lastPhraseTimestamp = 0;

const junoAutoLauncher = new AutoLaunch({
  name: 'Juno Global Voice',
  path: app.getPath('exe'),
});

// Windows fix: Re-enable GPU for smoother dragging, but add stability flags
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

app.on('will-quit', async (event) => {
  event.preventDefault();
  stopUiohook();
  globalShortcut.unregisterAll();
  if (wsClient) try { wsClient.terminate(); } catch (e) {}
  
  // Set a timeout for closing the bridge to ensure the app exits
  const closePromise = closeChromeBridge();
  const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1500));
  
  await Promise.race([closePromise, timeoutPromise]);
  app.exit(0);
});

function toggleListening(forceLang = null) {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    dialog.showErrorBox('Service Not Ready', 'Speech service is not connected or Chrome bridge crashed. Please restart the app.');
    isListening = false;
    const overlayWindow = getOverlayWindow();
    if (overlayWindow) overlayWindow.hide();
    updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
    return;
  }
  
  const status = store.get('licenseStatus');
  if (status === 'expired') {
    showSettings();
    return;
  }
  
  isListening = !isListening;
  const overlayWindow = getOverlayWindow();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('play-sound', isListening);
  }

  if (isListening) {
    sessionWordCount = 0;
    if (!store.get('statsFirstDate')) store.set('statsFirstDate', Date.now());
    store.set('statsSessions', (store.get('statsSessions') || 0) + 1);
    lastPhraseTimestamp = 0;
    const lang = forceLang || store.get('language') || 'en-US';
    currentSessionLang = lang;
    const silenceTimeout = store.get('silenceTimeout') || 15;

    if (overlayWindow) {
      overlayWindow.webContents.send('session-start', { lang });
      applyOverlaySize();
      overlayWindow.showInactive();
      const pos = store.get(store.get('overlayMini') ? 'overlayMiniPosition' : 'overlayPosition');
      if (pos) overlayWindow.setPosition(pos.x, pos.y); else overlayWindow.center();
    }
    try {
      wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: silenceTimeout }));
    } catch (e) {
      console.error('Failed to send start command:', e);
    }
  } else {
    if (overlayWindow) overlayWindow.hide();
    try {
      wsClient.send(JSON.stringify({ command: 'stop' }));
    } catch (e) {
      console.error('Failed to send stop command:', e);
    }
  }
  updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
}

function switchTrayLanguage(langCode) {
  store.set('language', langCode);
  const overlayWindow = getOverlayWindow();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('set-language', langCode);
  const settingsWindow = getSettingsWindow();
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('language-changed', langCode);
  
  if (isListening && wsClient && wsClient.readyState === WebSocket.OPEN) {
    try {
      wsClient.send(JSON.stringify({ command: 'stop' }));
      setTimeout(() => {
        if (isListening && wsClient && wsClient.readyState === WebSocket.OPEN) {
          wsClient.send(JSON.stringify({ command: 'start', language: langCode, timeout: store.get('silenceTimeout') || 15 }));
        }
      }, 200);
    } catch (e) {
      console.error('Failed to switch language on wsClient:', e);
    }
  }
  updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
}

function resetSilenceTimer() {
  if (wsClient && isListening && wsClient.readyState === WebSocket.OPEN) {
    try {
      wsClient.send(JSON.stringify({ command: 'ping' }));
    } catch (e) {}
  }
}

function resetModifiers() {
  const mods = ['alt', 'command', 'control', 'shift'];
  mods.forEach(m => {
    try { robot.keyToggle(m, 'up'); } catch(e) {}
  });
}

function robustKeyTap(key, modifier) {
  // Map common names to RobotJS specific names if needed
  const ROBOT_KEY_MAP = {
    'backspace': 'backspace',
    'enter': 'enter',
    'tab': 'tab',
    'escape': 'escape',
    'up': 'up',
    'down': 'down',
    'left': 'left',
    'right': 'right',
    'space': 'space'
  };
  
  const targetKey = ROBOT_KEY_MAP[key.toLowerCase()] || key;

  // Validate modifier: RobotJS expects a string or array of strings like 'alt', 'command', 'control', 'shift'
  let targetMod = [];
  if (modifier) {
    const validMods = ['alt', 'command', 'control', 'shift'];
    if (Array.isArray(modifier)) {
      targetMod = modifier.filter(m => validMods.includes(m.toLowerCase()));
    } else if (typeof modifier === 'string' && validMods.includes(modifier.toLowerCase())) {
      targetMod = [modifier.toLowerCase()];
    }
  }

  setTimeout(() => {
    try {
      if (process.platform === 'darwin') {
        if (targetMod.length === 0) resetModifiers();
        // robot.keyTap on Mac MUST receive an array for the second argument if specified, 
        // or nothing at all. Passing undefined/null causes the "Invalid key flag" error.
        robot.keyTap(targetKey, targetMod);
      } else {
        if (targetMod.length > 0) {
          targetMod.forEach(m => robot.keyToggle(m, 'down'));
        }
        robot.keyToggle(targetKey, 'down');
        setTimeout(() => {
          robot.keyToggle(targetKey, 'up');
          if (targetMod.length > 0) {
            targetMod.forEach(m => robot.keyToggle(m, 'up'));
          }
        }, 15);
      }
    } catch(e) {
      console.error(`robustKeyTap error for key "${targetKey}" with mods "${JSON.stringify(targetMod)}":`, e);
    }
  }, 50);
}

// ── Text Replacement ────────────────────────────────────────────────────────
// Only fires when the ENTIRE spoken transcript (trimmed, case-insensitive)
// exactly matches a trigger phrase.  Partial matches — the trigger appearing
// somewhere inside a longer sentence — are intentionally ignored.
function applyTextReplacements(text) {
  if (!store.get('textReplaceEnabled')) return text;
  const rules = store.get('textReplacements') || [];
  if (!rules.length) return text;

  const trimmed = text.trim();
  for (const rule of rules) {
    const say = (rule.say || '').trim();
    if (!say) continue;
    if (trimmed.toLowerCase() === say.toLowerCase()) {
      return rule.replace || '';
    }
  }
  return text;
}

function setupWebSocketServer(server) {
  wss = new WebSocket.Server({ server });
  wss.on('connection', (ws) => {
    wsClient = ws;
    const savedMicId = store.get('selectedMicId');
    if (savedMicId) ws.send(JSON.stringify({ command: 'set-device', deviceId: savedMicId }));
    const sens = store.get('micSensitivity');
    if (sens !== undefined) ws.send(JSON.stringify({ command: 'set-mic-sensitivity', sensitivity: sens }));
    
    ws.on('message', (message) => {
      const data = JSON.parse(message.toString());
      if (data.type === 'final-text') {
        let rawText = data.text;
        const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;
        sessionWordCount += wordCount;
        store.set('statsWords', (store.get('statsWords') || 0) + wordCount);
        
        const lang = currentSessionLang || store.get('language') || 'en-US';
        const usage = store.get('statsLangUsage') || {};
        usage[lang] = (usage[lang] || 0) + wordCount;
        store.set('statsLangUsage', usage);

        // Apply text replacement BEFORE sending to overlay or injecting
        const replacedText = applyTextReplacements(rawText);

        const overlayWindow = getOverlayWindow();
        if (overlayWindow) {
          overlayWindow.webContents.send('session-word-count', sessionWordCount);
          overlayWindow.webContents.send('transcript', { text: replacedText });
        }

        // Always add a space if this is not the first phrase of the session
        const textToInject = (lastPhraseTimestamp > 0) ? ' ' + replacedText : replacedText;
        lastPhraseTimestamp = Date.now();
        clipboardManager.injectText(textToInject);
      } else if (data.type === 'interim-text') {
        const overlayWindow = getOverlayWindow();
        if (overlayWindow) overlayWindow.webContents.send('interim-text', data.text);
      } else if (data.type === 'status') {
        if (data.message === 'silence-timeout' && isListening) {
          toggleListening();
          const overlayWindow = getOverlayWindow();
          if (overlayWindow) overlayWindow.webContents.send('overlay-status', 'silence-timeout');
        }
      } else if (data.type === 'audio-data') {
        const overlayWindow = getOverlayWindow();
        if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
          overlayWindow.webContents.send('audio-data', { bins: data.bins, volume: data.volume });
        }
      } else if (data.type === 'device-list') {
        const { handleMicListMessage } = require('./src/main/ipc-handlers');
        handleMicListMessage(data.devices || []);
      }
    });
  });
}

function setupHttpServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/speech-bridge.html')) {
      fs.readFile(path.join(__dirname, 'engine', 'speech-bridge.html'), (err, data) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    }
  }).listen(0, 'localhost', () => {
    httpPort = server.address().port;
    setupWebSocketServer(server);
    launchChromeBridge(`http://localhost:${httpPort}/speech-bridge.html?port=${httpPort}`).catch(()=>{});
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide();
    app.setActivationPolicy('accessory');
    
    // Check Accessibility Permissions
    const { systemPreferences } = require('electron');
    const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!isTrusted) {
      console.warn("macOS Accessibility permissions missing! Keyboard shortcuts and injection may not work.");
      // We can prompt the user
      dialog.showMessageBox({
        type: 'warning',
        title: 'Permissions Required',
        message: 'Juno Voice needs Accessibility permissions to type text into other apps.',
        detail: 'Please go to System Settings -> Privacy & Security -> Accessibility, and allow this app (or your terminal if running in dev mode). Then restart the app.',
        buttons: ['Open System Settings', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        }
      });
    }
  }
  checkAuthStatus();
  if (store.get('autoLaunch')) junoAutoLauncher.enable().catch(() => {});
  createTray(toggleListening, showSettings, app, switchTrayLanguage, isListening);
  createOverlay();
  getOverlayWindow().webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Overlay Console] ${message} (line ${line})`);
  });
  registerHotkeys(toggleListening);
  setupHttpServer();
  setupIpcHandlers(toggleListening, registerHotkeys, () => wsClient, resetSilenceTimer, showSettings, robustKeyTap, clipboardManager.injectCharDirect.bind(clipboardManager), clipboardManager.injectText.bind(clipboardManager), switchTrayLanguage, resetModifiers);
  setupUpdater(getSettingsWindow);  // pass getter so updater always gets current window, not null
  setTimeout(() => showSettings(), 1000);
});
