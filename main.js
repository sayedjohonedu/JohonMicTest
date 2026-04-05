const { app, globalShortcut, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const robot = require('robotjs');

const store = require('./store/config');
const { launchChromeBridge, closeChromeBridge } = require('./engine/chrome-launcher');
const clipboardManager = require('./src/main/clipboard-manager');
const clipboardMonitor = require('./src/main/clipboard-monitor');
const clipboardHistoryStore = require('./src/main/clipboard-history-store');
const { showClipboardManager, toggleClipboardManager, getClipboardWindow, notifyClipboardWindow } = require('./src/main/clipboard-window-manager');
const { setupClipboardIpc } = require('./src/main/clipboard-ipc');

// Import modules
const { createOverlay, showSettings, showLicensePopup, showWordLimitPopup, showTranslatorLockedPopup, applyOverlaySize, getOverlayWindow, getSettingsWindow } = require('./src/main/window-manager');
const { onOverlayShow, onOverlayHide } = require('./src/main/floating-browser-manager');
const { registerHotkeys, stopUiohook, setTranslatorCtx } = require('./src/main/hotkey-manager');
const { checkAuthStatus, checkAndResetDailyWords } = require('./src/main/licensing');
const { setupUpdater } = require('./src/main/updater');
const { setupIpcHandlers } = require('./src/main/ipc-handlers');
const { createTray, updateTrayMenu } = require('./src/main/tray-manager');
const translatorManager = require('./src/main/translator-manager');

// Global state
let wss = null;
let wsClient = null;
let isListening = false;
let httpPort = 9123;
let sessionWordCount = 0;
let currentSessionLang = 'en-US';
let lastPhraseTimestamp = 0;

// ── Translator mode: 'overlay' | 'translator' ───────────────
// Controls where STT transcripts are routed. The two panels are mutually exclusive.
let sttMode = 'overlay';

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

function normaliseLangCode(code) {
  if (!code || code === 'auto') return store.get('language') || 'en-US';
  // Already a BCP-47 tag with subtag (e.g. en-US, zh-CN)
  if (code.includes('-')) return code;
  // Map common short ISO 639-1 codes to BCP-47
  const MAP = {
    en:'en-US', bn:'bn-BD', es:'es-ES', fr:'fr-FR', de:'de-DE', it:'it-IT',
    pt:'pt-PT', ru:'ru-RU', ja:'ja-JP', ko:'ko-KR', ar:'ar-SA', hi:'hi-IN',
    tr:'tr-TR', pl:'pl-PL', nl:'nl-NL', sv:'sv-SE', da:'da-DK', fi:'fi-FI',
    no:'nb-NO', uk:'uk-UA', vi:'vi-VN', th:'th-TH', id:'id-ID', ms:'ms-MY',
    fa:'fa-IR', ur:'ur-PK', he:'he-IL', ro:'ro-RO', hu:'hu-HU', cs:'cs-CZ',
    el:'el-GR', bg:'bg-BG',
  };
  return MAP[code] || code;
}

function toggleListening(forceLang = null, fromTranslator = false, forceStart = false) {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    dialog.showErrorBox('Service Not Ready', 'Speech service is not connected or Chrome bridge crashed. Please restart the app.');
    isListening = false;
    if (sttMode === 'overlay') {
      const overlayWindow = getOverlayWindow();
      if (overlayWindow) overlayWindow.hide();
    }
    updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
    return;
  }

  const status = store.get('licenseStatus');
  // ── Free tier (trial ended, no paid key): check daily word limit ──
  if (status === 'free') {
    checkAndResetDailyWords();
    const used = store.get('freeDailyWords') || 0;
    if (used >= 300) {
      showWordLimitPopup();
      return;
    }
    // Under limit — allow session to proceed (tracking happens in final-text handler)
  }
  // ── Gumroad key revoked / invalid ──
  if (status === 'expired') { showLicensePopup(); return; }

  // Overriding sttMode if we get a global STT hotkey while in translator mode
  if (sttMode === 'translator' && !fromTranslator) {
    closeTranslatorAndRestoreOverlay(); // Sets sttMode='overlay' and stops listening
    // We are now switching back to overlay, so we proceed to toggle it ON
  }

  // ── forceStart: always do a full stop→start cycle (for language change / swap)
  // We do NOT skip based on language match — the caller already decided a restart is needed.
  if (forceStart && isListening) {
    try { wsClient.send(JSON.stringify({ command: 'stop' })); } catch (e) {}
    isListening = false;
    // Notify translator UI so the button reflects the brief stopped state
    if (sttMode === 'translator') {
      const tw = translatorManager.getTranslatorWindow();
      if (tw && !tw.isDestroyed()) tw.webContents.send('translator-stt-state', false);
    }
    // Small gap so the STT engine can cleanly reset before we send start
    setTimeout(() => toggleListening(forceLang, fromTranslator, false), 150);
    return;
  }

  isListening = !isListening;
  const overlayWindow = getOverlayWindow();

  // Play sound cue always
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('play-sound', isListening);
  }

  if (sttMode === 'translator') {
    // ── TRANSLATOR MODE: just start/stop STT, do NOT touch the overlay window
    const tw = translatorManager.getTranslatorWindow();
    if (isListening) {
      sessionWordCount = 0;
      lastPhraseTimestamp = 0;
      // Normalise short ISO codes to BCP-47 for the STT engine (e.g. 'en' → 'en-US')
      const lang = normaliseLangCode(forceLang);
      currentSessionLang = lang;
      // Use translator-specific silence timeout; 0 means infinite (never auto-stop)
      const silenceTimeout = store.get('translatorSilenceEnabled')
        ? (store.get('translatorSilenceTimeout') ?? 0)
        : 0;
      if (tw && !tw.isDestroyed()) tw.webContents.send('translator-stt-state', true);
      try { wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: silenceTimeout })); } catch (e) {}
    } else {
      if (tw && !tw.isDestroyed()) tw.webContents.send('translator-stt-state', false);
      try { wsClient.send(JSON.stringify({ command: 'stop' })); } catch (e) {}
    }
    updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
    return;
  }

  // ── OVERLAY MODE: normal behavior
  if (isListening) {
    sessionWordCount = 0;
    if (!store.get('statsFirstDate')) store.set('statsFirstDate', Date.now());
    store.set('statsSessions', (store.get('statsSessions') || 0) + 1);
    lastPhraseTimestamp = 0;
    const lang = forceLang || store.get('language') || 'en-US';
    currentSessionLang = lang;
    const silenceTimeout = store.get('silenceTimeout') ?? 1;

    if (overlayWindow) {
      overlayWindow.webContents.send('session-start', { lang });
      if (store.get('overlayMini')) {
        overlayWindow.setMinimumSize(280, 38);
        overlayWindow.setSize(280, 38);
      } else {
        applyOverlaySize();
      }
      overlayWindow.showInactive();
      const pos = store.get('overlayPosition');
      if (pos && typeof pos.x === 'number') overlayWindow.setPosition(pos.x, pos.y);
      else overlayWindow.center();
    }
    onOverlayShow();
    try { wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: silenceTimeout })); } catch (e) {
      console.error('Failed to send start command:', e);
    }
  } else {
    onOverlayHide();
    if (overlayWindow) overlayWindow.hide();
    try { wsClient.send(JSON.stringify({ command: 'stop' })); } catch (e) {
      console.error('Failed to send stop command:', e);
    }
    // Show word limit popup at session end if free-tier user has hit today's limit
    if (store.get('licenseStatus') === 'free' && (store.get('freeDailyWords') || 0) >= 300) {
      setTimeout(() => showWordLimitPopup(), 400);
    }
  }
  updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
}
// Expose so translator IPC can call it
toggleListening._self = toggleListening;

function openTranslator() {
  // Block free-tier users: translator is a paid feature
  const status = store.get('licenseStatus');
  if (status === 'free' || status === 'expired') {
    showTranslatorLockedPopup();
    return;
  }
  // Allow co-existence: if STT is running in overlay mode, just switch mode
  // If STT is running in overlay mode, stop the overlay cleanly first
  if (sttMode === 'overlay' && isListening) {
    // Gracefully stop the overlay STT session
    toggleListening(); // stops listening + hides overlay
  }
  sttMode = 'translator';
  translatorManager.showTranslator();
  // Wire the toggle function so translator-toggle-listening IPC can call it
  openTranslator._toggleListening = toggleListening;
}

function closeTranslatorAndRestoreOverlay() {
  // If STT is running in translator mode, stop it
  if (sttMode === 'translator' && isListening) {
    try { wsClient && wsClient.readyState === 1 && wsClient.send(JSON.stringify({ command: 'stop' })); } catch (e) {}
    isListening = false;
    updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
  }
  sttMode = 'overlay';
  translatorManager.closeTranslator();
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
          wsClient.send(JSON.stringify({ command: 'start', language: langCode, timeout: store.get('silenceTimeout') ?? 1 }));
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
    // BUGFIX: Terminate old wsClient before reassigning. When Chrome bridge
    // crashes and reconnects, the old socket must be killed so its buffered
    // messages don't trigger toggleListening() on a stale connection.
    if (wsClient && wsClient !== ws) {
      try { wsClient.terminate(); } catch (e) {}
    }
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

        // Track free-tier daily word usage
        const currentStatus = store.get('licenseStatus');
        if (currentStatus === 'free') {
          const dailyUsed = store.get('freeDailyWords') || 0;
          store.set('freeDailyWords', dailyUsed + wordCount);
        }
        
        const lang = currentSessionLang || store.get('language') || 'en-US';
        const usage = store.get('statsLangUsage') || {};
        usage[lang] = (usage[lang] || 0) + wordCount;
        store.set('statsLangUsage', usage);

        // Apply text replacement BEFORE sending to overlay or injecting
        const replacedText = applyTextReplacements(rawText);

        const overlayWindow = getOverlayWindow();

        if (sttMode === 'translator') {
          // ── TRANSLATOR MODE: send transcript to translator panel, do NOT type globally
          const tw = translatorManager.getTranslatorWindow();
          if (tw && !tw.isDestroyed()) {
            tw.webContents.send('translator-transcript', replacedText);
            translatorManager.resetTranslatorSilenceTimer();
            if (overlayWindow && !overlayWindow.isDestroyed()) {
              overlayWindow.webContents.send('session-word-count', sessionWordCount);
            }
          }
        } else {
          // ── OVERLAY MODE: existing behavior
          if (overlayWindow) {
            overlayWindow.webContents.send('session-word-count', sessionWordCount);
            overlayWindow.webContents.send('transcript', { text: replacedText });
          }
          const textToInject = (lastPhraseTimestamp > 0) ? ' ' + replacedText : replacedText;
          lastPhraseTimestamp = Date.now();
          clipboardManager.injectText(textToInject);
        }
      } else if (data.type === 'interim-text') {
        if (sttMode === 'translator') {
          const tw = translatorManager.getTranslatorWindow();
          if (tw && !tw.isDestroyed()) tw.webContents.send('translator-interim', data.text);
        } else {
          const overlayWindow = getOverlayWindow();
          if (overlayWindow) overlayWindow.webContents.send('interim-text', data.text);
        }
      } else if (data.type === 'status') {
        if (data.message === 'silence-timeout' && isListening) {
          // In translator mode, only auto-stop if the translator silence timer is enabled
          if (sttMode === 'translator' && !store.get('translatorSilenceEnabled')) {
            // Silence timer is disabled for translator — re-arm and continue listening
            // (engine already stopped internally; send start again to resume)
            const tw = translatorManager.getTranslatorWindow();
            isListening = false; // reset so toggleListening can turn it on again
            if (tw && !tw.isDestroyed()) tw.webContents.send('translator-stt-state', false);
            setTimeout(() => toggleListening(null, true, false), 200);
          } else {
            toggleListening();
            const overlayWindow = getOverlayWindow();
            if (overlayWindow) overlayWindow.webContents.send('overlay-status', 'silence-timeout');
          }
        }
      } else if (data.type === 'audio-data') {
        const overlayWindow = getOverlayWindow();
        if (sttMode === 'translator') {
          const tw = translatorManager.getTranslatorWindow();
          if (tw && !tw.isDestroyed() && tw.isVisible()) {
            tw.webContents.send('translator-audio-data', data.bins);
          }
        } else if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
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
  checkAndResetDailyWords(); // Reset daily word counter if it's a new day
  
  // Apply the unified login item setting
  app.setLoginItemSettings({
    openAtLogin: store.get('autoLaunch') === true,
    path: app.getPath('exe')
  });

  createTray(toggleListening, showSettings, app, switchTrayLanguage, isListening);
  createOverlay();
  getOverlayWindow().webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Overlay Console] ${message} (line ${line})`);
  });
  registerHotkeys(toggleListening);

  // ── Wire translator shortcuts into hotkey-manager so they survive unregisterAll()
  setTranslatorCtx({
    openTranslator,
    closeTranslatorAndRestoreOverlay,
    isTranslatorVisible: () => translatorManager.isTranslatorVisible(),
    getTranslatorWindow: () => translatorManager.getTranslatorWindow(),
  });
  // Re-run registerHotkeys now that translatorCtx is set
  registerHotkeys(toggleListening);

  setupHttpServer();
  setupIpcHandlers(
    toggleListening, registerHotkeys, () => wsClient, resetSilenceTimer, showSettings,
    robustKeyTap, clipboardManager.injectCharDirect.bind(clipboardManager),
    clipboardManager.injectText.bind(clipboardManager), switchTrayLanguage, resetModifiers,
    resetSilenceTimer,
  { openTranslator, closeTranslatorAndRestoreOverlay, toggleListening, getCurrentSttMode: () => sttMode }
  );
  setupUpdater(getSettingsWindow);  // pass getter so updater always gets current window, not null

  // ── Clipboard Manager init ───────────────────────────────────────────────
  setupClipboardIpc();
  clipboardHistoryStore.load();

  // Check free-user TTL on startup
  const isPaid = store.get('licenseStatus') === 'active';
  const retention = store.get('clipboardRetention') || '7days';
  clipboardHistoryStore.pruneExpired(isPaid, retention);

  // Check if free user has entries older than 7 days that need manual action
  if (!isPaid && !store.get('clipboardAutoDelete')) {
    const expiry = clipboardHistoryStore.checkFreeUserExpiry();
    if (expiry) {
      // Show the clipboard manager with expired-prompt notification
      setTimeout(() => {
        showClipboardManager();
        setTimeout(() => {
          notifyClipboardWindow('cb-expired-prompt', {
            oldestDate: expiry.oldestDate.toISOString()
          });
        }, 800);
      }, 2000);
    }
  } else if (!isPaid && store.get('clipboardAutoDelete')) {
    clipboardHistoryStore.deleteOldestDay();
  }

  // Start clipboard monitor
  clipboardMonitor.start((entry, isDuplicate) => {
    // Push real-time update to clipboard window if open
    notifyClipboardWindow('cb-new-entry', { entry, isDuplicate });

    // Check TTL after each new entry
    if (!isPaid && !store.get('clipboardAutoDelete')) {
      const expiry = clipboardHistoryStore.checkFreeUserExpiry();
      if (expiry) {
        notifyClipboardWindow('cb-expired-prompt', {
          oldestDate: expiry.oldestDate.toISOString()
        });
      }
    } else if (!isPaid && store.get('clipboardAutoDelete')) {
      clipboardHistoryStore.deleteOldestDay();
    }
  });

  setTimeout(() => showSettings(), 1000);
});
