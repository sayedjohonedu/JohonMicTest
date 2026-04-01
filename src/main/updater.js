const { autoUpdater } = require('electron-updater');

// Accepts a getter function so we always get the current window, not a stale null
function setupUpdater(getSettingsWindow) {
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'available', version: info.version });
    }
  });

  autoUpdater.on('update-not-available', () => {
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'not-available' });
    }
  });

  autoUpdater.on('error', (err) => {
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'error', message: err.message });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'progress', percent: progressObj.percent });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'downloaded' });
    }
  });
}

module.exports = {
  setupUpdater
};
