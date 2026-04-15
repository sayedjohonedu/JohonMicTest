const { autoUpdater } = require('electron-updater');
const store = require('../../store/config');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Track the latest available version for the reminder popup
let latestAvailableVersion = null;

// Accepts a getter function so we always get the current window, not a stale null
function setupUpdater(getSettingsWindow, getUpdateReminderPopupWindow, showUpdateReminderPopup) {
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    latestAvailableVersion = info.version;

    // ── Forward to settings window (existing behavior) ──
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'available', version: info.version });
    }

    // ── Show update reminder popup if conditions are met ──
    maybeShowReminder(info.version, getUpdateReminderPopupWindow, showUpdateReminderPopup);
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
    // Also forward to reminder popup if open
    const rpw = getUpdateReminderPopupWindow();
    if (rpw && !rpw.isDestroyed()) {
      rpw.webContents.send('update-status', { type: 'error', message: err.message });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'progress', percent: progressObj.percent });
    }
    // Also forward to reminder popup if open
    const rpw = getUpdateReminderPopupWindow();
    if (rpw && !rpw.isDestroyed()) {
      rpw.webContents.send('update-status', { type: 'progress', percent: progressObj.percent });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    const win = getSettingsWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { type: 'downloaded' });
    }
    // Also forward to reminder popup if open
    const rpw = getUpdateReminderPopupWindow();
    if (rpw && !rpw.isDestroyed()) {
      rpw.webContents.send('update-status', { type: 'downloaded' });
    }
  });

  // ── Auto-check for updates 5 seconds after startup ──
  setTimeout(() => {
    try {
      autoUpdater.checkForUpdates().catch(() => {});
    } catch (e) {
      // Silently ignore — might fail in dev mode
    }
  }, 5000);
}

/**
 * Decide whether to show the update reminder popup.
 *
 * Rules:
 * 1. If the available version is DIFFERENT from the last dismissed version → show immediately
 *    (a new release should always notify the user)
 * 2. If the same version was dismissed → only show again after 30 days
 * 3. Never show if the settings window is already focused and foregrounded
 */
function maybeShowReminder(version, getUpdateReminderPopupWindow, showUpdateReminderPopup) {
  const dismissedAt = store.get('updateReminderDismissedAt') || 0;
  const dismissedVersion = store.get('updateReminderVersion') || '';

  const isNewVersion = version !== dismissedVersion;
  const timeSinceDismiss = Date.now() - dismissedAt;
  const cooldownExpired = timeSinceDismiss >= THIRTY_DAYS_MS;

  if (!isNewVersion && !cooldownExpired) {
    // Same version was dismissed less than 30 days ago — don't bother
    return;
  }

  // Show the reminder popup after a brief delay so the app is fully loaded
  setTimeout(() => {
    const popup = showUpdateReminderPopup();
    if (popup && !popup.isDestroyed()) {
      // Wait for the page to load before sending version info
      popup.webContents.once('did-finish-load', () => {
        popup.webContents.send('update-reminder-info', { version });
      });
      // If already loaded (cached), send immediately
      if (!popup.webContents.isLoading()) {
        popup.webContents.send('update-reminder-info', { version });
      }
    }
  }, 2000);
}

function getLatestAvailableVersion() {
  return latestAvailableVersion;
}

module.exports = {
  setupUpdater,
  getLatestAvailableVersion
};
