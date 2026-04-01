const { BrowserWindow, app, screen } = require('electron');
const path = require('path');
const store = require('../../store/config');

let overlayWindow = null;
let settingsWindow = null;

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
  }

  overlayWindow.loadFile(path.join(__dirname, '../../ui', 'overlay.html'));
  
  overlayWindow.on('moved', () => {
    const pos = overlayWindow.getPosition();
    store.set('overlayPosition', { x: pos[0], y: pos[1] });
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

function getOverlayWindow() { return overlayWindow; }
function getSettingsWindow() { return settingsWindow; }

module.exports = {
  createOverlay,
  showSettings,
  applyOverlaySize,
  getOverlayWindow,
  getSettingsWindow,
  OV
};
