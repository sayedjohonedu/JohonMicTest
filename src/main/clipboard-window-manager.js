/**
 * clipboard-window-manager.js
 * ──────────────────────────────────────────────────────────────────────────
 * Creates and manages the Clipboard Manager BrowserWindow.
 * Entirely isolated from main window-manager.js.
 * ──────────────────────────────────────────────────────────────────────────
 */

const { BrowserWindow, app } = require('electron');
const path = require('path');
const store = require('../../store/config');

let _clipboardWindow = null;

// Injected from clipboard-ipc.js so we can re-lift the overlay after clipboard appears.
// On Windows all HWND_TOPMOST windows share one OS level — last focused wins.
// Calling moveTop() on the overlay right after clipboard shows keeps overlay on top.
let _reassertOverlay = null;
function setOverlayMover(fn) { _reassertOverlay = fn; }

function _liftOverlay() {
  if (_reassertOverlay) {
    // Small delay so the clipboard window fully renders first, then overlay moves back on top
    setTimeout(_reassertOverlay, 50);
  }
}

function showClipboardManager() {
  if (_clipboardWindow && !_clipboardWindow.isDestroyed()) {
    if (process.platform === 'darwin') app.setActivationPolicy('regular');
    _clipboardWindow.show();
    _clipboardWindow.focus();
    _liftOverlay();
    // Tell the renderer to refresh immediately — visibilitychange is not
    // reliable in Electron on Windows when using hide/show cycles.
    _clipboardWindow.webContents.send('cb-window-shown');
    return _clipboardWindow;
  }

  const isMac = process.platform === 'darwin';
  const savedPos = store.get('clipboardWindowPosition');
  const posOptions = savedPos ? { x: savedPos.x, y: savedPos.y } : {};

  const platformOptions = isMac
    ? {
        titleBarStyle: 'hiddenInset',
        vibrancy: 'sidebar',
        visualEffectState: 'active',
        backgroundColor: '#00000000',
      }
    : {
        transparent: false,
        frame: false,
        thickFrame: false,
        backgroundColor: '#0D0D14',
        hasShadow: true,
      };

  _clipboardWindow = new BrowserWindow({
    width:      780,
    height:     650,
    ...posOptions,
    title:      'MicTab — Clipboard Manager',
    icon:       path.join(__dirname, '../../assets', 'logo', 'dark-logo-solid-black-background.png'),
    resizable:  false,
    maximizable: false,
    alwaysOnTop: true,
    ...platformOptions,
    webPreferences: {
      nodeIntegration:   false,
      contextIsolation:  true,
      preload: path.join(__dirname, '../../ui', 'clipboard-preload.js'),
    },
  });

  // macOS: use 'floating' level (below overlay's 'screen-saver').
  // Windows: level strings don't meaningfully differ; we use moveTop() timing instead.
  if (process.platform === 'darwin') {
    _clipboardWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    _clipboardWindow.setAlwaysOnTop(true, 'floating');
  } else {
    _clipboardWindow.setAlwaysOnTop(true, 'floating');
  }

  _clipboardWindow.loadFile(path.join(__dirname, '../../ui', 'clipboard.html'));

  // After clipboard renders, re-lift the overlay so it stays on top
  _clipboardWindow.on('ready-to-show', () => _liftOverlay());
  _clipboardWindow.on('show', () => _liftOverlay());
  // Re-assert whenever user clicks into clipboard (focus event)
  _clipboardWindow.on('focus', () => _liftOverlay());

  _clipboardWindow.on('moved', () => {
    if (_clipboardWindow && !_clipboardWindow.isDestroyed()) {
      const [x, y] = _clipboardWindow.getPosition();
      store.set('clipboardWindowPosition', { x, y });
    }
  });

  if (isMac) {
    // Keep app as 'regular' while clipboard window is open
    // to avoid macOS double-click-to-activate behavior
    app.setActivationPolicy('regular');
    _clipboardWindow.on('closed', () => {
      _clipboardWindow = null;
      // Only revert to accessory if no other interactive windows remain
      // (lazy-require to avoid circular dependency)
      const { maybRevertToAccessory } = require('./window-manager');
      maybRevertToAccessory();
    });
  } else {
    _clipboardWindow.on('closed', () => { _clipboardWindow = null; });
  }

  return _clipboardWindow;
}

function getClipboardWindow() {
  return _clipboardWindow;
}

function hideClipboardManager() {
  if (_clipboardWindow && !_clipboardWindow.isDestroyed()) {
    _clipboardWindow.hide();
    if (process.platform === 'darwin') {
      const { maybRevertToAccessory } = require('./window-manager');
      maybRevertToAccessory();
    }
  }
}

function toggleClipboardManager() {
  if (!_clipboardWindow || _clipboardWindow.isDestroyed()) {
    return showClipboardManager();
  }
  if (_clipboardWindow.isVisible()) {
    _clipboardWindow.hide();
    if (process.platform === 'darwin') {
      const { maybRevertToAccessory } = require('./window-manager');
      maybRevertToAccessory();
    }
  } else {
    if (process.platform === 'darwin') app.setActivationPolicy('regular');
    _clipboardWindow.show();
    _clipboardWindow.focus();
    _liftOverlay();
    _clipboardWindow.webContents.send('cb-window-shown');
  }
  return _clipboardWindow;
}

function closeClipboardManager() {
  if (_clipboardWindow && !_clipboardWindow.isDestroyed()) {
    _clipboardWindow.close();
  }
}

/**
 * Send an IPC message to the clipboard window renderer (if open).
 * Used by the monitor to push new entries in real-time.
 */
function notifyClipboardWindow(channel, data) {
  if (_clipboardWindow && !_clipboardWindow.isDestroyed()) {
    _clipboardWindow.webContents.send(channel, data);
  }
}

module.exports = {
  showClipboardManager,
  toggleClipboardManager,
  hideClipboardManager,
  getClipboardWindow,
  closeClipboardManager,
  notifyClipboardWindow,
  setOverlayMover,
};
