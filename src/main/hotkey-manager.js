const { globalShortcut } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const store = require('../../store/config');

let holdKeyTimer    = null;
let holdKeyPressed  = false;
let uiohookRunning  = false;
let middleMouseTimer = null;
let middleMousePressed = false;

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

  const middleMouseAction = store.get('middleMouseAction') || 'none';

  let middleMouseLastPress = 0;

  if (middleMouseAction !== 'none') {
    uIOhook.on('mousedown', (e) => {
      // button 3 is usually middle mouse button for uiohook-napi
      if (e.button !== 3) return;

      const now = Date.now();
      if (now - middleMouseLastPress < 300) return; // Debounce double clicks
      middleMouseLastPress = now;

      if (middleMouseTimer) {
        clearTimeout(middleMouseTimer);
        middleMouseTimer = null;
      }

      if (middleMouseAction === 'click') {
        toggleListening();
      } else if (middleMouseAction === 'hold_1' || middleMouseAction === 'hold_2') {
        const holdDur = middleMouseAction === 'hold_2' ? 2000 : 1000;
        middleMouseTimer = setTimeout(() => {
          toggleListening();
          middleMouseTimer = null;
        }, holdDur);
      }
    });

    uIOhook.on('mouseup', (e) => {
      if (e.button !== 3) return;
      if (middleMouseTimer) {
        clearTimeout(middleMouseTimer);
        middleMouseTimer = null;
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
  stopUiohook
};
