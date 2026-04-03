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

function setTranslatorCtx(ctx) {
  _translatorCtx = ctx;
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
};
