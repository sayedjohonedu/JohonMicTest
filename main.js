const { app, globalShortcut, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const robot = require('robotjs');

const store = require('./store/config');
const { launchChromeBridge, closeChromeBridge, getActiveBrowserInfo } = require('./engine/chrome-launcher');
const clipboardManager = require('./src/main/clipboard-manager');
const clipboardMonitor = require('./src/main/clipboard-monitor');
const clipboardHistoryStore = require('./src/main/clipboard-history-store');
const { showClipboardManager, toggleClipboardManager, getClipboardWindow, notifyClipboardWindow } = require('./src/main/clipboard-window-manager');
const { setupClipboardIpc } = require('./src/main/clipboard-ipc');

// Import modules
const { createOverlay, showSettings, showLicensePopup, showWordLimitPopup, showTranslatorLockedPopup, showAiTrialExpiredPopup, applyOverlaySize, getOverlayWindow, getSettingsWindow, showUpdateReminderPopup, getUpdateReminderPopupWindow, createOfflinePill } = require('./src/main/window-manager');
const { onOverlayShow, onOverlayHide } = require('./src/main/floating-browser-manager');
const { registerHotkeys, stopUiohook, setTranslatorCtx, setAiSendNow, setAiModeToggle, setWhisperApiCallbacks, setWhisperAiModeToggle, setLensCaptureCallback, setAppStoreCallback, setGetIsListening, isPttSessionActive } = require('./src/main/hotkey-manager');
const { checkAuthStatus, checkAndResetDailyWords, checkAiTrialExpiry } = require('./src/main/licensing');
const { setupUpdater } = require('./src/main/updater');
const { setupIpcHandlers, aiDictationManager } = require('./src/main/ipc-handlers');
const { createTray, updateTrayMenu, setCaptureAction, setTranslatorAction } = require('./src/main/tray-manager');
const translatorManager = require('./src/main/translator-manager');
const { showCaptureOverlay, setupLensIpc, isCaptureOverlayOpen, closeCaptureOverlay } = require('./src/main/lens-manager');
const { setupScreenRecorderIpc } = require('./src/main/screen-recorder-manager');
const { setupGalleryIpc, openGallery } = require('./src/main/gallery-manager');
const { setupEditorIpc } = require('./src/main/video-editor-manager');
const appStoreManager = require('./src/main/appstore-manager');
const MsEdgeTTSManager = require('./src/main/msedge-tts-manager');
const edgeTTSManager = new MsEdgeTTSManager();
edgeTTSManager.init();



// One-time migration (v1.2.8): Swap keys — Whisper: ShiftRight→MetaRight, AI Send: MetaRight→ShiftRight
if (store.get('whisperApiActivationKey') === 'AltRight' || store.get('whisperApiActivationKey') === 'ShiftRight') {
  store.set('whisperApiActivationKey', process.platform === 'darwin' ? 'MetaRight' : 'ControlRight');
}
if (store.get('aiActivationKey') === 'MetaRight' || store.get('aiActivationKey') === 'ControlRight') {
  store.set('aiActivationKey', 'ShiftRight');
}

// Global state
let wss = null;
let wsClient = null;
let isListening = false;
let updateReminderPopupTimer = null;
let silenceTimeoutResetTimer = null;
let httpPort = 9123;
let sessionWordCount = 0;
let currentSessionLang = 'en-US';
let pttBuffer = '';
let lastPhraseTimestamp = 0;
let latestInterimText = '';
let flushedInterimText = '';

// ── STT routing: 'overlay' | 'translator' ───────────────
// Controls where STT transcripts are routed. The two panels are mutually exclusive.
let sttMode = 'overlay';

// ── Helper: is AI dictation currently active for the overlay path?
function isAiModeActive() {
  return sttMode === 'overlay' && store.get('aiModeEnabled') === true;
}

// ── AI Dictation: separate silence timer for auto-processing (does NOT close overlay)
let aiSilenceTimer = null;
function clearAiSilenceTimer() {
  if (aiSilenceTimer) { clearTimeout(aiSilenceTimer); aiSilenceTimer = null; }
}

/**
 * Process the AI buffer and continue listening.
 * Used by both the AI silence timer (auto) and Right Alt (manual trigger).
 * Does NOT stop the dictation session — overlay stays open, listening continues.
 */
function processAiBufferAndContinue() {
  if (!isAiModeActive()) return;
  clearAiSilenceTimer();

  // Flush any pending interim text instantly
  if (latestInterimText && latestInterimText.trim()) {
    const replacedText = applyTextReplacements(latestInterimText);
    aiDictationManager.bufferTranscript(replacedText);
    flushedInterimText = latestInterimText;
    latestInterimText = '';
  }

  const buffered = aiDictationManager.getBufferedText().trim();
  if (!buffered) return;
  // Process buffer + paste, but keep the session alive
  const overlayWindow = getOverlayWindow();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('ai-processing-start');
  }
  aiDictationManager.processBuffer().then(result => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('ai-processing-end', result);
    }
    if (result.text && !result.error && !result.allFailed) {
      clipboardManager.injectText(result.text);
    } else if (result.allFailed && result.rawText && result.rawText.trim()) {
      clipboardManager.injectText(result.rawText);
    } else if (result.error) {
      const raw = aiDictationManager.getBufferedText();
      if (raw.trim()) clipboardManager.injectText(raw);
    }
    // Clear buffer and reset overlay for next dictation segment
    aiDictationManager.clearBuffer();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      // Reset overlay to listening state
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('ai-buffer-reset');
        }
      }, 1200);
    }
  }).catch(err => {
    console.error('AI processing failed:', err);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('ai-processing-end', { error: err.message });
    }
  });
}

function resetAiSilenceTimer() {
  clearAiSilenceTimer();
  if (!isAiModeActive()) return;
  const timeoutSec = store.get('aiSilenceTimeout') ?? 8;
  aiSilenceTimer = setTimeout(() => {
    aiSilenceTimer = null;
    if (!isAiModeActive()) return;
    processAiBufferAndContinue();
  }, timeoutSec * 1000);
}

/**
 * Toggle AI dictation mode on/off via hotkey (Alt+Shift+C).
 * Notifies all windows so UI stays in sync.
 */
function toggleAiMode() {
  const { checkAiTrialExpiry } = require('./src/main/licensing');
  const current = store.get('aiModeEnabled') === true;
  const newState = !current;

  // If enabling, enforce AI trial
  if (newState) {
    if (!store.get('aiFirstEnabledDate')) {
      store.set('aiFirstEnabledDate', Date.now());
    }
    const trial = checkAiTrialExpiry();
    if (trial.expired) {
      const { showAiTrialExpiredPopup } = require('./src/main/window-manager');
      showAiTrialExpiredPopup();
      return;
    }
  }

  store.set('aiModeEnabled', newState);

  // Notify all windows (settings, overlay, etc.) so UI stays in sync
  const { BrowserWindow } = require('electron');
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('config-updated', { aiModeEnabled: newState });
      win.webContents.send('ai-mode-toggled', newState);
    }
  });

  console.log(`[AI Mode] Toggled ${newState ? 'ON' : 'OFF'} via hotkey`);
}

/**
 * Toggle Whisper AI Polish on/off via hotkey (Right Alt + Right Shift + /).
 * Notifies all windows so UI stays in sync.
 */
function toggleWhisperAiMode() {
  const current = store.get('whisperApiAiEnabled') === true;
  const newState = !current;

  store.set('whisperApiAiEnabled', newState);

  // Notify all windows (settings, overlay, pill, etc.) so UI stays in sync
  const { BrowserWindow } = require('electron');
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('whisper-ai-mode-toggled', newState);
      win.webContents.send('whisper-ai-mode-pill', newState);
    }
  });

  console.log(`[Whisper AI] Toggled ${newState ? 'ON' : 'OFF'} via hotkey (Right Alt+Right Shift+/)`);
}

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

// Singleton reference so only one bridge-error window can exist at a time
let _bridgeErrorWin = null;

function toggleListening(forceLang = null, fromTranslator = false, forceStart = false, skipAiProcessing = false) {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    // If the bridge-error window is already open, just bring it to focus
    if (_bridgeErrorWin && !_bridgeErrorWin.isDestroyed()) {
      _bridgeErrorWin.focus();
      isListening = false;
      if (sttMode === 'overlay') {
        const overlayWindow = getOverlayWindow();
        if (overlayWindow) overlayWindow.hide();
      }
      updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
      return;
    }

    const { BrowserWindow } = require('electron');
    _bridgeErrorWin = new BrowserWindow({
      width: 520,
      height: 580,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      frame: false,
      transparent: true,
      vibrancy: 'popover',
      visualEffectState: 'active',
      alwaysOnTop: true,
      resizable: false
    });
    _bridgeErrorWin.loadFile(path.join(__dirname, 'ui', 'bridge-error.html'));
    _bridgeErrorWin.on('closed', () => { _bridgeErrorWin = null; });
    
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
    if (used >= 500) {
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
    // For AI mode and PTT mode: set bridge silence timeout to 0 (infinite) so it never fires
    // silence-timeout — the AI silence timer in main.js handles processing independently,
    // and PTT handles closing on key up.
    // For regular mode: use the normal silence timeout.
    const silenceTimeout = (isAiModeActive() || (isPttSessionActive && isPttSessionActive())) ? 0 : (store.get('silenceTimeout') ?? 10);
    pttBuffer = '';
    // Clear AI buffer at session start
    if (isAiModeActive()) {
      aiDictationManager.clearBuffer();
      clearAiSilenceTimer();
    }

    if (overlayWindow) {
      overlayWindow.webContents.send('session-start', { lang, isPtt: isPttSessionActive && isPttSessionActive() });
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
    clearAiSilenceTimer();
    try { wsClient.send(JSON.stringify({ command: 'stop' })); } catch (e) {
      console.error('Failed to send stop command:', e);
    }

    // Flush any pending interim text instantly
    if (latestInterimText && latestInterimText.trim()) {
      const replacedText = applyTextReplacements(latestInterimText);
      if (sttMode === 'translator') {
        const tw = translatorManager.getTranslatorWindow();
        if (tw && !tw.isDestroyed()) {
          tw.webContents.send('translator-transcript', replacedText);
        }
      } else if (isAiModeActive()) {
        aiDictationManager.bufferTranscript(replacedText);
      } else {
        const textToInject = (lastPhraseTimestamp > 0 && !(isPttSessionActive && isPttSessionActive())) ? ' ' + replacedText : replacedText;
        lastPhraseTimestamp = Date.now();
        if (isPttSessionActive && isPttSessionActive()) {
          pttBuffer += (pttBuffer ? ' ' : '') + textToInject.trimStart();
        } else {
          clipboardManager.injectText(textToInject);
        }
      }
      flushedInterimText = latestInterimText;
      latestInterimText = '';
    }

    if (pttBuffer) {
      clipboardManager.injectText(pttBuffer);
      pttBuffer = '';
    }

    // ── AI Dictation: handle buffer on stop ──
    if (isAiModeActive() && !skipAiProcessing && aiDictationManager.getBufferedText().trim()) {
      // Keep overlay visible for processing feedback (no hide→re-show flicker)
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('ai-processing-start');
      }

      aiDictationManager.processBuffer().then(result => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('ai-processing-end', result);
          setTimeout(() => {
            if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
            onOverlayHide();
          }, 1500);
        }

        if (result.allFailed) {
          // ALL profiles failed — inject raw text so user doesn't lose words
          if (result.rawText && result.rawText.trim()) {
            clipboardManager.injectText(result.rawText);
          }
          const failedNames = (result.errors || []).map(e => `• ${e.profile}: ${e.error}`).join('\n');
          dialog.showMessageBox({
            type: 'warning',
            title: 'AI Dictation — All Profiles Failed',
            message: 'None of your AI profiles could process the dictation.',
            detail: `Your raw dictated text has been pasted as-is so you don't lose it.\n\nFailed profiles:\n${failedNames || '(none configured)'}\n\nThis will keep happening until you fix your API keys/models, or turn off AI Dictation to use regular mode.`,
            buttons: ['Open Settings', 'Disable AI Mode', 'OK'],
            defaultId: 2,
            cancelId: 2,
          }).then(({ response }) => {
            if (response === 0) showSettings();
            else if (response === 1) store.set('aiModeEnabled', false);
          });
        } else if (result.text && !result.error) {
          clipboardManager.injectText(result.text);
        } else if (result.error) {
          console.error('AI processing error:', result.error);
          const rawText = aiDictationManager.getBufferedText();
          if (rawText.trim()) clipboardManager.injectText(rawText);
        }
      }).catch(err => {
        console.error('AI processing failed:', err);
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('ai-processing-end', { error: err.message });
          setTimeout(() => {
            if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
            onOverlayHide();
          }, 1500);
        }
      });
    } else {
      // Non-AI mode OR AI mode with skipAiProcessing (user clicked X) — hide immediately
      if (isAiModeActive() && skipAiProcessing) {
        aiDictationManager.clearBuffer();
      }
      onOverlayHide();
      if (overlayWindow) overlayWindow.hide();
    }

    // Show word limit popup at session end if free-tier user has hit today's limit
    if (store.get('licenseStatus') === 'free' && (store.get('freeDailyWords') || 0) >= 500) {
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
          wsClient.send(JSON.stringify({ command: 'start', language: langCode, timeout: store.get('silenceTimeout') ?? 10 }));
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
// Shared module — used by both overlay pipeline and Whisper API pipeline.
const { applyTextReplacements } = require('./src/main/text-replacements');

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
        latestInterimText = '';

        if (flushedInterimText) {
          if (rawText.toLowerCase().startsWith(flushedInterimText.toLowerCase())) {
            rawText = rawText.substring(flushedInterimText.length).trim();
          }
          flushedInterimText = '';
        }

        if (!rawText) return;

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
        } else if (isAiModeActive()) {
          // ── AI DICTATION MODE: buffer transcript, do NOT inject yet
          aiDictationManager.bufferTranscript(replacedText);
          // Reset the AI silence timer since we just got new text
          resetAiSilenceTimer();
          if (overlayWindow) {
            overlayWindow.webContents.send('session-word-count', sessionWordCount);
            overlayWindow.webContents.send('transcript', { text: replacedText });
            overlayWindow.webContents.send('ai-buffer-update', {
              bufferLength: aiDictationManager.getBufferedText().length,
            });
          }
        } else {
          // ── OVERLAY MODE: existing behavior
          if (overlayWindow) {
            overlayWindow.webContents.send('session-word-count', sessionWordCount);
            overlayWindow.webContents.send('transcript', { text: replacedText });
          }
          const textToInject = (lastPhraseTimestamp > 0 && !(isPttSessionActive && isPttSessionActive())) ? ' ' + replacedText : replacedText;
          lastPhraseTimestamp = Date.now();
          if (isPttSessionActive && isPttSessionActive()) {
            pttBuffer += (pttBuffer ? ' ' : '') + textToInject.trimStart();
          } else {
            clipboardManager.injectText(textToInject);
          }
        }
      } else if (data.type === 'interim-text') {
        latestInterimText = data.text;
        if (sttMode === 'translator') {
          const tw = translatorManager.getTranslatorWindow();
          if (tw && !tw.isDestroyed()) tw.webContents.send('translator-interim', data.text);
        } else {
          const overlayWindow = getOverlayWindow();
          if (overlayWindow) overlayWindow.webContents.send('interim-text', data.text);
          // Reset AI silence timer on interim text too — the user is actively speaking,
          // so the countdown should restart. Without this, the timer could fire mid-sentence
          // if a single utterance takes longer than the AI silence timeout.
          if (isAiModeActive() && data.text && data.text.trim()) {
            resetAiSilenceTimer();
          }
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
          } else if (isPttSessionActive && isPttSessionActive()) {
            // Push-to-Talk mode: ignore silence-timeout and re-arm bridge to keep listening
            const lang = currentSessionLang || store.get('language') || 'en-US';
            try { wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: 0 })); } catch (e) {}
          } else if (isAiModeActive()) {
            // AI mode: bridge silence-timeout should NOT fire (timeout=0 in AI mode),
            // but handle gracefully as a safety net. Do NOT process buffer here —
            // only the AI silence timer or Right Alt trigger should process.
            // Just transparently restart the bridge to keep the session alive.
            const lang = currentSessionLang || store.get('language') || 'en-US';
            try { wsClient.send(JSON.stringify({ command: 'start', language: lang, timeout: 0 })); } catch (e) {}
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
  checkAiTrialExpiry();       // Auto-disable AI mode if 15-day free trial expired

  // ── Central API Vault: migrate legacy profile pools on first launch ──
  const apiVault = require('./src/main/api-vault');
  apiVault.migrateIfNeeded();
  
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
  // Wire AI instant-process trigger (Right Alt) into hotkey-manager
  setAiSendNow(processAiBufferAndContinue);
  // Wire AI mode toggle (Alt+Shift+C) into hotkey-manager
  setAiModeToggle(toggleAiMode);
  // Wire Whisper AI Polish mode toggle (Right Alt+Right Shift+/) into hotkey-manager
  setWhisperAiModeToggle(toggleWhisperAiMode);
  setGetIsListening(() => isListening);
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

  // ── MicTab Lens (Alt+Shift+S) ─────────────────────────────────────
  setupLensIpc();
  const lensAction = () => {
    // Check lens trial/license before allowing capture
    const { checkLensTrialExpiry } = require('./src/main/licensing');
    const lensTrial = checkLensTrialExpiry();
    if (lensTrial.expired) {
      const { showLensLockedPopup } = require('./src/main/window-manager');
      showLensLockedPopup();
      return;
    }
    if (isCaptureOverlayOpen()) closeCaptureOverlay();
    else showCaptureOverlay();
  };
  setLensCaptureCallback(lensAction);
  setCaptureAction(lensAction);   // ← tray "Capture" menu item

  // ── Translator Panel (Alt+Shift+T) ──────────────────────────────
  const translatorAction = () => {
    if (translatorManager.isTranslatorVisible()) {
      closeTranslatorAndRestoreOverlay();
    } else {
      openTranslator();
    }
  };
  setTranslatorAction(translatorAction);

  // Also allow triggering from the overlay icon button
  ipcMain.on('open-lens-capture', lensAction);
  registerHotkeys(toggleListening);

  // ── Screen Recorder (launched from Lens editor toolbar) ───────────
  setupScreenRecorderIpc();

  // ── Media Gallery ─────────────────────────────────────────────────
  setupGalleryIpc();

  // ── Video Editor ──────────────────────────────────────────────────
  setupEditorIpc();

  // ── App Store / Toolbox (Alt+Shift+A) ─────────────────────────────
  appStoreManager.setupAppStoreIpc();
  const appStoreAction = () => {
    if (appStoreManager.isAppStoreVisible()) appStoreManager.closeAppStore();
    else appStoreManager.showAppStore();
  };
  setAppStoreCallback(appStoreAction);
  ipcMain.on('open-appstore', appStoreAction);
  registerHotkeys(toggleListening);

  // ── Whisper API (Cloud) init ──────────────────────────────────────
  const whisperApiManager = require('./src/main/whisper-api-manager');
  const whisperPill = createOfflinePill();
  whisperApiManager.setPillWindow(whisperPill);
  whisperApiManager.setClipboardManager(clipboardManager);
  whisperApiManager.init();
  setWhisperApiCallbacks({
    onKeyDown: () => whisperApiManager.onKeyDown(),
    onKeyUp:   () => whisperApiManager.onKeyUp(),
  });

  // Re-register so whisper API hold-key is active
  registerHotkeys(toggleListening);

  setupHttpServer();
  setupIpcHandlers(
    toggleListening, registerHotkeys, () => wsClient, resetSilenceTimer, showSettings,
    robustKeyTap, clipboardManager.injectCharDirect.bind(clipboardManager),
    clipboardManager.injectText.bind(clipboardManager), switchTrayLanguage, resetModifiers,
    resetSilenceTimer,
  { openTranslator, closeTranslatorAndRestoreOverlay, toggleListening, getCurrentSttMode: () => sttMode }
  );
  setupUpdater(getSettingsWindow, getUpdateReminderPopupWindow, showUpdateReminderPopup);  // pass getters + shower so updater can show reminder popup

  // ── Clipboard Manager init ───────────────────────────────────────────────
  setupClipboardIpc();
  clipboardHistoryStore.load();

  // Only start clipboard monitoring + TTL checks when the feature is enabled
  const clipboardEnabled = store.get('clipboardEnabled') !== false;

  if (clipboardEnabled) {
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
      const isPaidNow = store.get('licenseStatus') === 'active';
      if (!isPaidNow && !store.get('clipboardAutoDelete')) {
        const expiry = clipboardHistoryStore.checkFreeUserExpiry();
        if (expiry) {
          notifyClipboardWindow('cb-expired-prompt', {
            oldestDate: expiry.oldestDate.toISOString()
          });
        }
      } else if (!isPaidNow && store.get('clipboardAutoDelete')) {
        clipboardHistoryStore.deleteOldestDay();
      }
    });
  }

  setTimeout(() => showSettings(), 1000);
});
