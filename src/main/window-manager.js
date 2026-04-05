const { BrowserWindow, app, screen } = require('electron');
const path = require('path');
const store = require('../../store/config');

let overlayWindow = null;
let settingsWindow = null;
let licensePopupWindow = null;
let wordLimitPopupWindow = null;
let translatorLockedPopupWindow = null;

const OV = {
  FULL_W:        420,
  BASE_H:        302,
  transcriptH:   0,
  punctH:        0,
  keyboardH:     0,
  emojiH:        0,
};

function applyOverlaySize() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (store.get('overlayMini')) return;
  
  // compensation for shadows and transparency margins
  const h = OV.BASE_H + OV.transcriptH + OV.punctH + OV.keyboardH + OV.emojiH + 10;
  
  overlayWindow.setResizable(true);
  overlayWindow.setMinimumSize(OV.FULL_W, h);
  
  // Use setBounds for more forceful resizing on some macOS environments
  const bounds = overlayWindow.getBounds();
  overlayWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: OV.FULL_W,
    height: h
  }, true); // true for animate (smoother on Mac)
  
  overlayWindow.setResizable(false);
  
  if (process.platform === 'win32') overlayWindow.setFocusable(false);
}

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: OV.FULL_W,
    height: OV.BASE_H + 16,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    hasShadow: true,
    focusable: false,
    // On macOS, 'panel' + certain behaviors makes it stay floating and non-activating
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../ui', 'overlay-preload.js')
    }
  });

  if (process.platform === 'darwin') {
    // This allows the window to float above full-screen apps and not take focus
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    // Windows: 'screen-saver' level keeps overlay above clipboard ('floating') and browser ('normal')
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  overlayWindow.loadFile(path.join(__dirname, '../../ui', 'overlay.html'));
  
  overlayWindow.on('moved', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const pos = overlayWindow.getPosition();
      // Always save to standard overlayPosition so dragged location translates globally
      // across both mini and standard mode.
      store.set('overlayPosition', { x: pos[0], y: pos[1] });
    }
  });

  overlayWindow.on('closed', () => overlayWindow = null);
  
  return overlayWindow;
}

function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  const isMac = process.platform === 'darwin';
  const platformOptions = isMac
    ? {
        titleBarStyle: 'hiddenInset',
        vibrancy: 'sidebar',
        visualEffectState: 'active',
        backgroundColor: '#00000000',
      }
    : {
        titleBarStyle: 'default',
        backgroundColor: '#1a1a2e',
        autoHideMenuBar: true,
      };

  const savedPos = store.get('settingsPosition');
  const posOptions = savedPos ? { x: savedPos.x, y: savedPos.y } : {};

  settingsWindow = new BrowserWindow({
    width: 750,
    height: 520,
    ...posOptions,
    icon: path.join(__dirname, '../../assets', 'logo', 'dark-logo-solid-black-background.png'),
    resizable: false,
    maximizable: false,
    ...platformOptions,
    webPreferences: {
      preload: path.join(__dirname, '../../ui', 'settings-preload.js')
    }
  });

  settingsWindow.on('moved', () => {
    if (settingsWindow) {
      const [x, y] = settingsWindow.getPosition();
      store.set('settingsPosition', { x, y });
    }
  });

  if (isMac) {
    setImmediate(() => app.setActivationPolicy('accessory'));
    settingsWindow.on('closed', () => {
      setImmediate(() => app.setActivationPolicy('accessory'));
    });
  }

  settingsWindow.loadFile(path.join(__dirname, '../../ui/settings.html'));
  settingsWindow.on('closed', () => settingsWindow = null);
  
  return settingsWindow;
}

function showLicensePopup() {
  if (licensePopupWindow && !licensePopupWindow.isDestroyed()) {
    licensePopupWindow.show();
    licensePopupWindow.focus();
    return licensePopupWindow;
  }

  licensePopupWindow = new BrowserWindow({
    width: 360,
    height: 265,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../ui', 'overlay-preload.js')
    }
  });

  licensePopupWindow.loadFile(path.join(__dirname, '../../ui/license-popup.html'));
  licensePopupWindow.on('closed', () => licensePopupWindow = null);

  licensePopupWindow.center();

  return licensePopupWindow;
}

function closeLicensePopup() {
  if (licensePopupWindow && !licensePopupWindow.isDestroyed()) {
    licensePopupWindow.close();
  }
}

function showWordLimitPopup() {
  if (wordLimitPopupWindow && !wordLimitPopupWindow.isDestroyed()) {
    wordLimitPopupWindow.show();
    wordLimitPopupWindow.focus();
    return wordLimitPopupWindow;
  }
  wordLimitPopupWindow = new BrowserWindow({
    width: 360,
    height: 280,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../ui', 'overlay-preload.js')
    }
  });
  wordLimitPopupWindow.loadFile(path.join(__dirname, '../../ui/wordlimit-popup.html'));
  wordLimitPopupWindow.on('closed', () => wordLimitPopupWindow = null);
  wordLimitPopupWindow.center();
  return wordLimitPopupWindow;
}

function closeWordLimitPopup() {
  if (wordLimitPopupWindow && !wordLimitPopupWindow.isDestroyed()) {
    wordLimitPopupWindow.close();
  }
}

function showTranslatorLockedPopup() {
  if (translatorLockedPopupWindow && !translatorLockedPopupWindow.isDestroyed()) {
    translatorLockedPopupWindow.show();
    translatorLockedPopupWindow.focus();
    return translatorLockedPopupWindow;
  }
  translatorLockedPopupWindow = new BrowserWindow({
    width: 360,
    height: 290,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../ui', 'overlay-preload.js')
    }
  });
  translatorLockedPopupWindow.loadFile(path.join(__dirname, '../../ui/translator-locked-popup.html'));
  translatorLockedPopupWindow.on('closed', () => translatorLockedPopupWindow = null);
  translatorLockedPopupWindow.center();
  return translatorLockedPopupWindow;
}

function closeTranslatorLockedPopup() {
  if (translatorLockedPopupWindow && !translatorLockedPopupWindow.isDestroyed()) {
    translatorLockedPopupWindow.close();
  }
}


function getOverlayWindow() { return overlayWindow; }
function getSettingsWindow() { return settingsWindow; }

module.exports = {
  createOverlay,
  showSettings,
  showLicensePopup,
  closeLicensePopup,
  showWordLimitPopup,
  closeWordLimitPopup,
  showTranslatorLockedPopup,
  closeTranslatorLockedPopup,
  applyOverlaySize,
  getOverlayWindow,
  getSettingsWindow,
  OV
};
