const { globalShortcut } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const store = require('../../store/config');

let holdKeyTimer    = null;
let holdKeyPressed  = false;
let uiohookRunning  = false;
let middleMouseTimer = null;
let middleMousePressed = false;

// Stored translator context so shortcuts survive re-registration
let _translatorCtx = null;

// AI instant-process callback (Right ⌘/Ctrl trigger)
let _aiSendNow = null;

// AI mode toggle callback (Alt+Shift+C)
let _aiModeToggle = null;

// Whisper AI Polish mode toggle callback (Right Alt + Right Shift + /)
let _whisperAiModeToggle = null;

// Whisper API mode press-and-hold callbacks
let _whisperApiCallbacks = null; // { onKeyDown, onKeyUp }

// Lens capture callback (Alt+Shift+S)
let _lensCaptureCallback = null;

function setTranslatorCtx(ctx) {
  _translatorCtx = ctx;
}

function setAiSendNow(fn) {
  _aiSendNow = fn;
}

function setAiModeToggle(fn) {
  _aiModeToggle = fn;
}

function setWhisperApiCallbacks(cbs) {
  _whisperApiCallbacks = cbs; // { onKeyDown, onKeyUp }
}

function setWhisperAiModeToggle(fn) {
  _whisperAiModeToggle = fn;
}

function setLensCaptureCallback(fn) {
  _lensCaptureCallback = fn;
}

function uiohookKeyName(keycode) {
  if (!uiohookKeyName._map) {
    uiohookKeyName._map = {};
    for (const [name, code] of Object.entries(UiohookKey)) {
      uiohookKeyName._map[code] = name;
    }
  }
  return uiohookKeyName._map[keycode] || String(keycode);
}

function registerHotkeys(toggleListening) {
  // 1) Combo shortcut (Global)
  globalShortcut.unregisterAll();
  const hotkeyEnabled = store.get('hotkeyEnabled') !== false;
  const hotkey        = store.get('hotkey') || 'Alt+C';

  if (hotkeyEnabled && hotkey) {
    try {
      globalShortcut.register(hotkey, () => toggleListening());
    } catch (e) {
      console.log('Hotkey registration failed:', e.message);
    }
  }

  // ── Translator shortcuts (always re-registered after unregisterAll) ──
  if (_translatorCtx) {
    const openShortcut  = store.get('translatorOpenShortcut')  || 'Shift+Alt+T';
    const pasteShortcut = store.get('translatorPasteShortcut') || 'Shift+Alt+P';
    try {
      globalShortcut.register(openShortcut, () => {
        const licStatus = store.get('licenseStatus');
        if (licStatus === 'free' || licStatus === 'expired') {
          // Show translator locked popup inline (avoid circular dep by lazy require)
          const { showTranslatorLockedPopup } = require('./window-manager');
          showTranslatorLockedPopup();
          return;
        }
        const { openTranslator, closeTranslatorAndRestoreOverlay, isTranslatorVisible } = _translatorCtx;
        if (isTranslatorVisible()) closeTranslatorAndRestoreOverlay();
        else openTranslator();
      });
    } catch (e) { console.log('Translator open shortcut failed:', e.message); }
    try {
      globalShortcut.register(pasteShortcut, () => {
        const { getTranslatorWindow } = _translatorCtx;
        const tw = getTranslatorWindow();
        if (tw && !tw.isDestroyed()) tw.webContents.send('translator-do-paste');
      });
    } catch (e) { console.log('Translator paste shortcut failed:', e.message); }
  }

  // ── Clipboard manager shortcut ──
  const cbGlobalEnabled = store.get('clipboardEnabled') !== false;
  const cbEnabled = store.get('clipboardHotkeyEnabled') !== false;
  const cbHotkey  = store.get('clipboardHotkey') || 'Alt+V';
  if (cbGlobalEnabled && cbEnabled && cbHotkey) {
    try {
      const { toggleClipboardManager } = require('./clipboard-window-manager');
      globalShortcut.register(cbHotkey, () => toggleClipboardManager());
    } catch (e) { console.log('Clipboard hotkey failed:', e.message); }
  }

  // ── AI Mode toggle shortcut (Alt+Shift+C) ──
  if (_aiModeToggle) {
    try {
      globalShortcut.register('Shift+Alt+C', () => _aiModeToggle());
    } catch (e) { console.log('AI toggle shortcut failed:', e.message); }
  }

  // ── Lens capture shortcut (Alt+Shift+S) ──
  if (_lensCaptureCallback) {
    try {
      globalShortcut.register('Alt+Shift+S', () => {
        console.log('[Lens] Alt+Shift+S pressed — starting capture');
        _lensCaptureCallback();
      });
    } catch (e) { console.log('Lens capture shortcut failed:', e.message); }
  }

  // 1b) Language-specific Combo Hotkeys
  const langHotkeys = store.get('langHotkeys') || [];
  langHotkeys.forEach((lh) => {
    if (lh.combo && lh.lang) {
      if (lh.combo === hotkey && hotkeyEnabled) return;
      try {
        globalShortcut.register(lh.combo, () => toggleListening(lh.lang));
      } catch (e) {
        console.log(`Lang Hotkey registration failed for ${lh.combo}:`, e.message);
      }
    }
  });

  // 2) Hold-key via uiohook-napi
  const holdEnabled  = store.get('holdKeyEnabled') === true;
  let holdKeyName    = store.get('holdKey');
  if (holdKeyName === undefined || holdKeyName === '') {
    holdKeyName = 'Alt';
  }
  const holdDuration = (store.get('holdDuration') || 2) * 1000;

  uIOhook.removeAllListeners('keydown');
  uIOhook.removeAllListeners('keyup');
  uIOhook.removeAllListeners('mousedown');
  uIOhook.removeAllListeners('mouseup');

  // ── AI Instant Send: configurable key trigger ──
  // Map DOM event.code → UiohookKey name for common modifiers/keys
  const CODE_TO_UIOHOOK = { AltRight:'AltRight', AltLeft:'Alt', ShiftRight:'ShiftRight', ShiftLeft:'Shift', ControlRight:'CtrlRight', ControlLeft:'Ctrl', MetaRight:'MetaRight', MetaLeft:'Meta', Space:'Space', F1:'F1', F2:'F2', F3:'F3', F4:'F4', F5:'F5', F6:'F6', F7:'F7', F8:'F8', F9:'F9', F10:'F10', F11:'F11', F12:'F12' };
  const aiDefaultKey = 'ShiftRight';
  const aiKeyCode = store.get('aiActivationKey') || aiDefaultKey;
  const uiohookName = CODE_TO_UIOHOOK[aiKeyCode] || aiKeyCode;
  const aiDefaultUiohook = UiohookKey.ShiftRight;
  const aiKeyCodeValue = UiohookKey[uiohookName] || aiDefaultUiohook;

  let aiSendNowLock = false;
  uIOhook.on('keydown', (e) => {
    if (e.keycode === aiKeyCodeValue && _aiSendNow && !aiSendNowLock) {
      aiSendNowLock = true;
      _aiSendNow();
    }
  });
  uIOhook.on('keyup', (e) => {
    if (e.keycode === aiKeyCodeValue) {
      aiSendNowLock = false;
    }
  });

  const mouseAction = store.get('mouseAction') || 'none';
  const mouseButton = parseInt(store.get('mouseButton') || '3', 10);

  // Track exact press time so we can validate actual hold duration on mouseup
  let mousePressTime = 0;
  let mouseSafetyTimer = null; // Auto-cancel if mouseup is swallowed (macOS Bluetooth issue)
  
  // For double click
  let lastClickTime = 0;

  const cancelMouseTimers = () => {
    if (middleMouseTimer) { clearTimeout(middleMouseTimer); middleMouseTimer = null; }
    if (mouseSafetyTimer) { clearTimeout(mouseSafetyTimer); mouseSafetyTimer = null; }
    mousePressTime = 0;
  };

  if (mouseAction !== 'none') {
    uIOhook.on('mousedown', (e) => {
      if (e.button !== mouseButton) return;

      const now = Date.now();

      // Double Click handling (ignores mouseup entirely)
      if (mouseAction === 'double_click') {
        if (now - lastClickTime < 400) {
          toggleListening();
          lastClickTime = 0; // reset
        } else {
          lastClickTime = now;
        }
        return; // Skip hold/click logic
      }

      // Single Click / Hold handling
      // Ignore if already tracking a press (double-fire protection)
      if (mousePressTime > 0) return;

      // Cancel any lingering timers from previous press
      cancelMouseTimers();
      mousePressTime = now;

      if (mouseAction === 'click') {
        toggleListening();
        mousePressTime = 0;
      } else if (mouseAction === 'hold_1' || mouseAction === 'hold_2') {
        const holdDur = mouseAction === 'hold_2' ? 2000 : 1000;

        // Main hold timer — fires if held long enough
        middleMouseTimer = setTimeout(() => {
          middleMouseTimer = null;
          // Safety check: only fire if we still think button is held
          if (mousePressTime > 0) {
            toggleListening();
            mousePressTime = 0;
          }
        }, holdDur);

        // Safety auto-cancel
        mouseSafetyTimer = setTimeout(() => {
          mouseSafetyTimer = null;
          cancelMouseTimers();
        }, holdDur + 500);
      }
    });

    uIOhook.on('mouseup', (e) => {
      if (e.button !== mouseButton) return;
      if (mouseAction === 'double_click') return; // Handled purely via mousedown

      const heldFor = mousePressTime > 0 ? Date.now() - mousePressTime : 0;
      cancelMouseTimers();

      const holdDur = mouseAction === 'hold_2' ? 2000 : 1000;
      if ((mouseAction === 'hold_1' || mouseAction === 'hold_2') && heldFor > 0 && heldFor < holdDur) {
        // Quick release — this was a tap, not a hold.
      }
    });
  }

  if (holdEnabled && holdKeyName) {
    uIOhook.on('keydown', (e) => {
      const pressed = uiohookKeyName(e.keycode);
      if (pressed !== holdKeyName) return;
      if (holdKeyPressed) return;
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


  // ── Whisper AI Polish mode toggle shortcut: Right Alt + Right Shift + Slash ──
  // Uses uiohook for key combo tracking since it needs to detect Right-side modifier keys.
  // The slash/question key (/) shares one key — hold Right Alt + Right Shift, then press it.
  let rightAltHeldForAi = false;
  let rightShiftHeldForAi = false;
  const SLASH_KEYCODE_MAC = 53;   // macOS: the '/' (also '?') key
  const SLASH_KEYCODE_WIN = 191;  // Windows: Slash/Question Mark key
  const SLASH_KEYCODE = process.platform === 'darwin' ? SLASH_KEYCODE_MAC : SLASH_KEYCODE_WIN;

  if (_whisperAiModeToggle) {
    uIOhook.on('keydown', (e) => {
      if (e.keycode === UiohookKey.AltRight)   rightAltHeldForAi   = true;
      if (e.keycode === UiohookKey.ShiftRight) rightShiftHeldForAi = true;
      if (e.keycode === SLASH_KEYCODE && rightAltHeldForAi && rightShiftHeldForAi) {
        _whisperAiModeToggle();
      }
    });
    uIOhook.on('keyup', (e) => {
      if (e.keycode === UiohookKey.AltRight)   rightAltHeldForAi   = false;
      if (e.keycode === UiohookKey.ShiftRight) rightShiftHeldForAi = false;
    });
  }

  // ── Whisper API: configurable press-and-hold (default: Right ⌘ / Right Ctrl) ──
  const whisperApiEnabled = store.get('whisperApiEnabled') === true;
  if (whisperApiEnabled && _whisperApiCallbacks) {
    const whisperDefaultKey = process.platform === 'darwin' ? 'MetaRight' : 'ControlRight';
    const whisperKeyCode = store.get('whisperApiActivationKey') || whisperDefaultKey;
    const whisperUiohookName = CODE_TO_UIOHOOK[whisperKeyCode] || whisperKeyCode;
    const whisperDefaultUiohook = process.platform === 'darwin' ? UiohookKey.MetaRight : UiohookKey.CtrlRight;
    const whisperKeyCodeValue = UiohookKey[whisperUiohookName] || whisperDefaultUiohook;

    let whisperHeld = false;
    uIOhook.on('keydown', (e) => {
      if (e.keycode === whisperKeyCodeValue && !whisperHeld) {
        whisperHeld = true;
        _whisperApiCallbacks.onKeyDown();
      }
    });
    uIOhook.on('keyup', (e) => {
      if (e.keycode === whisperKeyCodeValue && whisperHeld) {
        whisperHeld = false;
        _whisperApiCallbacks.onKeyUp();
      }
    });
  }

  if (!uiohookRunning) {
    try {
      uIOhook.start();
      uiohookRunning = true;
    } catch (e) {
      console.log('uiohook start failed:', e.message);
    }
  }
}

function stopUiohook() {
  if (uiohookRunning) {
    try {
      uIOhook.stop();
      uiohookRunning = false;
    } catch (e) {}
  }
}

module.exports = {
  registerHotkeys,
  stopUiohook,
  setTranslatorCtx,
  setAiSendNow,
  setAiModeToggle,
  setOfflineModeCallbacks: () => {}, // no-op stub for backward compat
  setWhisperApiCallbacks,
  setWhisperAiModeToggle,
  setLensCaptureCallback,
};
