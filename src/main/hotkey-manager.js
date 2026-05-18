const { globalShortcut } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const store = require('../../store/config');

let holdKeyTimer    = null;
let holdKeyPressed  = false;
let uiohookRunning  = false;
let middleMouseTimer = null;
let middleMousePressed = false;
let pttStartedSession = false;
let pttGraceTimer = null;   // Grace period timer: delays stop after PTT key release
let _pttToggleListening = null; // Stored reference to toggleListening for grace timer callback

const registeredHotkeys = { keydown: [], keyup: [], mousedown: [], mouseup: [] };
function clearHotkeys() {
  for (const evt of Object.keys(registeredHotkeys)) {
    registeredHotkeys[evt].forEach(fn => uIOhook.removeListener(evt, fn));
    registeredHotkeys[evt] = [];
  }
}
function addHotkey(evt, fn) {
  uIOhook.on(evt, fn);
  if (registeredHotkeys[evt]) registeredHotkeys[evt].push(fn);
}

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

// App Store callback (Alt+Shift+A)
let _appStoreCallback = null;

// Floating Browser toggle callback (Cmd/Ctrl+Shift+B)
let _browserToggleCallback = null;

// Pending text checker — returns true if Chrome has unfinalized interim text
let _hasPendingText = null;

function setTranslatorCtx(ctx) {
  _translatorCtx = ctx;
}

let _getIsListening = null;
function setGetIsListening(fn) {
  _getIsListening = fn;
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

function setAppStoreCallback(fn) {
  _appStoreCallback = fn;
}

function setBrowserToggleCallback(fn) {
  _browserToggleCallback = fn;
}

function setHasPendingText(fn) {
  _hasPendingText = fn;
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

  // ── App Store shortcut (configurable, default Alt+Shift+A) ──
  if (_appStoreCallback) {
    const appStoreShortcut = store.get('appStoreShortcut') || 'Shift+Alt+A';
    try {
      globalShortcut.register(appStoreShortcut, () => {
        _appStoreCallback();
      });
    } catch (e) { console.log('App Store shortcut failed:', e.message); }
  }

  // ── Floating Browser shortcut (configurable, default Cmd/Ctrl+Shift+B) ──
  if (_browserToggleCallback) {
    const browserShortcut = store.get('floatingBrowserShortcut') || 'Shift+Alt+B';
    try {
      globalShortcut.register(browserShortcut, () => {
        _browserToggleCallback();
      });
    } catch (e) { console.log('Floating Browser shortcut failed:', e.message); }
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
    holdKeyName = process.platform === 'darwin' ? 'ControlLeft' : 'F8';
  }
  const holdDuration = (store.get('holdDuration') || 2) * 1000;

  clearHotkeys();

  // ── AI Instant Send: configurable key trigger ──
  // Map DOM event.code → UiohookKey name for common modifiers/keys
  const CODE_TO_UIOHOOK = { AltRight:'AltRight', AltLeft:'Alt', ShiftRight:'ShiftRight', ShiftLeft:'Shift', ControlRight:'CtrlRight', ControlLeft:'Ctrl', MetaRight:'MetaRight', MetaLeft:'Meta', Space:'Space', F1:'F1', F2:'F2', F3:'F3', F4:'F4', F5:'F5', F6:'F6', F7:'F7', F8:'F8', F9:'F9', F10:'F10', F11:'F11', F12:'F12' };
  function getUioName(code) {
    if (CODE_TO_UIOHOOK[code]) return CODE_TO_UIOHOOK[code];
    if (code.startsWith('Key')) return code.substring(3);
    if (code.startsWith('Digit')) return code.substring(5);
    return code;
  }
  const aiDefaultKey = 'ShiftRight';
  const aiKeyCode = store.get('aiActivationKey') || aiDefaultKey;
  const uiohookName = getUioName(aiKeyCode);
  const aiDefaultUiohook = UiohookKey.ShiftRight;
  const aiKeyCodeValue = UiohookKey[uiohookName] || aiDefaultUiohook;

  let aiSendNowLock = false;
  addHotkey('keydown', (e) => {
    if (e.keycode === aiKeyCodeValue && _aiSendNow && !aiSendNowLock) {
      aiSendNowLock = true;
      _aiSendNow();
    }
  });
  addHotkey('keyup', (e) => {
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
    addHotkey('mousedown', (e) => {
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

    addHotkey('mouseup', (e) => {
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
    const uioName = getUioName(holdKeyName);
    const holdKeyCodeValue = UiohookKey[uioName];

    _pttToggleListening = toggleListening; // Store for grace timer callback
    if (holdKeyCodeValue) {
      addHotkey('keydown', (e) => {
        if (e.keycode === holdKeyCodeValue && !holdKeyPressed) {
          holdKeyPressed = true;
          // Cancel any pending grace period stop — user re-pressed the key
          if (pttGraceTimer) {
            clearTimeout(pttGraceTimer);
            pttGraceTimer = null;
            return; // Session is still alive, just keep listening
          }
          const isCurrentlyListening = _getIsListening ? _getIsListening() : false;
          if (!isCurrentlyListening) {
            pttStartedSession = true;
            toggleListening();
          } else {
            pttStartedSession = false;
          }
        }
      });

      addHotkey('keyup', (e) => {
        if (e.keycode === holdKeyCodeValue && holdKeyPressed) {
          holdKeyPressed = false;
          const isCurrentlyListening = _getIsListening ? _getIsListening() : true;
          if (isCurrentlyListening && pttStartedSession) {
            const hasPending = _hasPendingText ? _hasPendingText() : false;
            if (hasPending) {
              // Grace period: Chrome has unfinalized interim text — keep bridge
              // alive so it can finalize before we stop and paste.
              if (pttGraceTimer) clearTimeout(pttGraceTimer);
              pttGraceTimer = setTimeout(() => {
                pttGraceTimer = null;
                if (pttStartedSession) {
                  toggleListening();
                  pttStartedSession = false;
                }
              }, 1500);
            } else {
              // No pending text — stop instantly like normal
              toggleListening();
              pttStartedSession = false;
            }
          } else {
            pttStartedSession = false;
          }
        }
      });
    } else {
      // Fallback if keycode isn't directly mapped
      addHotkey('keydown', (e) => {
        const pressed = uiohookKeyName(e.keycode);
        if (pressed !== holdKeyName) return;
        if (holdKeyPressed) return;
        holdKeyPressed = true;
        // Cancel any pending grace period stop — user re-pressed the key
        if (pttGraceTimer) {
          clearTimeout(pttGraceTimer);
          pttGraceTimer = null;
          return; // Session is still alive, just keep listening
        }
        const isCurrentlyListening = _getIsListening ? _getIsListening() : false;
        if (!isCurrentlyListening) {
          pttStartedSession = true;
          toggleListening();
        } else {
          pttStartedSession = false;
        }
      });

      addHotkey('keyup', (e) => {
        const released = uiohookKeyName(e.keycode);
        if (released !== holdKeyName) return;
        if (holdKeyPressed) {
          holdKeyPressed = false;
          const isCurrentlyListening = _getIsListening ? _getIsListening() : true;
          if (isCurrentlyListening && pttStartedSession) {
            const hasPending = _hasPendingText ? _hasPendingText() : false;
            if (hasPending) {
              // Grace period: Chrome has unfinalized interim text
              if (pttGraceTimer) clearTimeout(pttGraceTimer);
              pttGraceTimer = setTimeout(() => {
                pttGraceTimer = null;
                if (pttStartedSession) {
                  toggleListening();
                  pttStartedSession = false;
                }
              }, 1500);
            } else {
              // No pending text — stop instantly
              toggleListening();
              pttStartedSession = false;
            }
          } else {
            pttStartedSession = false;
          }
        }
      });
    }
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
    addHotkey('keydown', (e) => {
      if (e.keycode === UiohookKey.AltRight)   rightAltHeldForAi   = true;
      if (e.keycode === UiohookKey.ShiftRight) rightShiftHeldForAi = true;
      if (e.keycode === SLASH_KEYCODE && rightAltHeldForAi && rightShiftHeldForAi) {
        _whisperAiModeToggle();
      }
    });
    addHotkey('keyup', (e) => {
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
    addHotkey('keydown', (e) => {
      if (e.keycode === whisperKeyCodeValue && !whisperHeld) {
        whisperHeld = true;
        _whisperApiCallbacks.onKeyDown();
      }
    });
    addHotkey('keyup', (e) => {
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
  setAppStoreCallback,
  setBrowserToggleCallback,
  setHasPendingText,
  setGetIsListening,
  isPttSessionActive: () => pttStartedSession,
  /** True when PTT key was released but we're waiting for Chrome to finalize speech */
  isPttGraceActive: () => !!pttGraceTimer,
  /** Cancel grace timer and immediately stop the PTT session */
  clearPttGrace: () => {
    if (pttGraceTimer) {
      clearTimeout(pttGraceTimer);
      pttGraceTimer = null;
    }
    if (pttStartedSession && _pttToggleListening) {
      _pttToggleListening();
      pttStartedSession = false;
    }
  }
};
