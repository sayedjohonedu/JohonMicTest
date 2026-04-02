const { ipcMain, dialog, BrowserWindow, shell, clipboard, app, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const store = require('../../store/config');
const { verifyLicense } = require('./licensing');
const { applyOverlaySize, getOverlayWindow, getSettingsWindow, OV } = require('./window-manager');
const { uIOhook } = require('uiohook-napi');

let pendingMicListResolve = null;

function setupIpcHandlers(toggleListening, registerHotkeys, getWsClient, resetSilenceTimer, showSettings, robustKeyTap, injectCharDirect, injectText, switchTrayLanguage, resetModifiers) {
  
  ipcMain.on('save-config', (event, config) => {
    store.set(config);
    registerHotkeys(toggleListening);

    const wsClient = getWsClient();
    if (wsClient) {
      wsClient.send(JSON.stringify({ command: 'set-mic-sensitivity', sensitivity: config.micSensitivity || 1.0 }));
    }
    const overlayWindow = getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('config-updated', config);
    }
  });

  ipcMain.handle('get-config', () => store.store);

  ipcMain.handle('get-stats', () => ({
    totalWords:    store.get('statsWords')     || 0,
    totalSessions: store.get('statsSessions')  || 0,
    langUsage:     store.get('statsLangUsage') || {},
    firstDate:     store.get('statsFirstDate') || 0,
  }));

  ipcMain.on('overlay-stop', () => toggleListening());
  ipcMain.on('reset-silence', () => resetSilenceTimer());
  
  ipcMain.on('window-drag', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const { screen } = require('electron');
    const startMousePos = screen.getCursorScreenPoint();
    const startWinPos = win.getPosition();

    const dragInterval = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(dragInterval);
        return;
      }
      const currentMousePos = screen.getCursorScreenPoint();
      const dx = currentMousePos.x - startMousePos.x;
      const dy = currentMousePos.y - startMousePos.y;
      win.setPosition(startWinPos[0] + dx, startWinPos[1] + dy);
    }, 16);

    const stopDrag = () => {
      clearInterval(dragInterval);
      ipcMain.removeListener('window-drag-stop', stopDrag);
    };

    win.on('closed', stopDrag);
    ipcMain.on('window-drag-stop', stopDrag);
    
    // Safety: stop if mouse is released (might not always fire if out of window)
    win.once('blur', stopDrag);
  });

  ipcMain.on('open-settings', () => { 
    resetSilenceTimer(); 
    const sw = showSettings();
    if (sw) {
      sw.show();
      sw.focus();
    }
  });
  ipcMain.on('open-url', (event, url) => shell.openExternal(url));

  ipcMain.on('inject-punct', (event, char) => {
    resetSilenceTimer();
    injectCharDirect(char);
  });

  ipcMain.on('reset-modifiers', () => {
    if (typeof resetModifiers === 'function') resetModifiers();
  });

  ipcMain.on('inject-enter', () => { 
    resetSilenceTimer(); 
    robustKeyTap('enter'); 
  });
  
  ipcMain.on('inject-backspace', () => { 
    resetSilenceTimer(); 
    robustKeyTap('backspace'); 
  });
  
  const KBD_MOD = process.platform === 'darwin' ? 'command' : 'control';
  ipcMain.on('inject-select-all', () => { resetSilenceTimer(); robustKeyTap('a', KBD_MOD); });
  ipcMain.on('inject-copy',       () => { resetSilenceTimer(); robustKeyTap('c', KBD_MOD); });
  ipcMain.on('inject-cut',        () => { resetSilenceTimer(); robustKeyTap('x', KBD_MOD); });
  ipcMain.on('inject-paste',      () => { resetSilenceTimer(); robustKeyTap('v', KBD_MOD); });
  ipcMain.on('inject-undo',       () => { resetSilenceTimer(); robustKeyTap('z', KBD_MOD); });

  ipcMain.on('inject-raw-key', (event, { key, modifiers = {} }) => {
    resetSilenceTimer();
    const mods = [];
    if (modifiers.ctrl)    mods.push('control');
    if (modifiers.alt)     mods.push('alt');
    if (modifiers.shift)   mods.push('shift');
    if (modifiers.command) mods.push('command');
    
    // If on Mac and user sent 'ctrl', they likely meant 'command' for many shortcuts,
    // but since we have discrete buttons, we respect what was sent.
    // However, robustKeyTap on Mac handles command/control correctly.
    
    robustKeyTap(key, mods.length > 0 ? mods : undefined);
  });

  ipcMain.on('set-overlay-keyboard-size', (event, { open }) => {
    if (store.get('overlayMini')) return;
    OV.keyboardH = open ? 191 : 0;
    applyOverlaySize();
  });

  ipcMain.on('overlay-set-emoji-size', (event, open) => {
    OV.emojiH = open ? 215 : 0;
    applyOverlaySize();
  });

  ipcMain.on('overlay-set-punct-extra', (event, extraH) => {
    OV.punctH = Math.max(0, extraH || 0);
    applyOverlaySize();
  });

  ipcMain.on('overlay-request-resize', (event, transcriptHeight) => {
    const overlayWindow = getOverlayWindow();
    if (!overlayWindow) return;
    if (store.get('overlayMini')) return;
    const BASE_TRANSCRIPT_H = 52;
    OV.transcriptH = Math.min(400, Math.max(0, transcriptHeight - BASE_TRANSCRIPT_H));
    applyOverlaySize();
  });

  ipcMain.on('overlay-change-language', (event, lang) => {
    switchTrayLanguage(lang);
  });

  ipcMain.on('toggle-favorite', (event, langCode) => {
    let favs = store.get('favorites') || [];
    if (favs.includes(langCode)) favs = favs.filter(c => c !== langCode);
    else favs.push(langCode);
    store.set('favorites', favs);
  });

  ipcMain.handle('verify-license', async (event, key) => verifyLicense(key));

  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.on('check-updates', () => autoUpdater.checkForUpdates());
  ipcMain.on('download-update', () => autoUpdater.downloadUpdate());
  ipcMain.on('install-update', () => autoUpdater.quitAndInstall());

  ipcMain.on('set-mini-mode', (event, isMini) => {
    const overlayWindow = getOverlayWindow();
    if (!overlayWindow) return;
    const MINI_W = 280, MINI_H = 38;

    // Save current position BEFORE any resize so we can restore it
    // (setSize/setMinimumSize can nudge the window on some platforms)
    const pos = overlayWindow.getPosition();
    store.set('overlayPosition', { x: pos[0], y: pos[1] });
    store.set('overlayMini', isMini);

    if (isMini) {
      // Reset all panel heights so the full overlay recalculates cleanly on expand
      OV.keyboardH  = 0;
      OV.emojiH     = 0;
      OV.punctH     = 0;
      OV.transcriptH = 0;
      overlayWindow.setMinimumSize(MINI_W, MINI_H);
      overlayWindow.setSize(MINI_W, MINI_H);
      if (process.platform === 'win32') overlayWindow.setFocusable(false);
    } else {
      applyOverlaySize();
    }

    // Restore position immediately after resize so the window stays anchored
    overlayWindow.setPosition(pos[0], pos[1]);
  });

  ipcMain.on('set-dropdown-open', (event, isOpen) => {
    const overlayWindow = getOverlayWindow();
    if (!overlayWindow) return;
    if (store.get('overlayMini')) {
      const MINI_W = 280, MINI_H = 38, DROPDOWN_H = 350;
      if (isOpen) {
        // Disable native shadow entirely when window is expanded purely for the dropdown,
        // this prevents Windows DWM and macOS WindowServer from drawing a giant box shadow.
        overlayWindow.setHasShadow(false);
        overlayWindow.setMinimumSize(MINI_W, DROPDOWN_H);
        overlayWindow.setSize(MINI_W, DROPDOWN_H);
      } else {
        overlayWindow.setMinimumSize(MINI_W, MINI_H);
        overlayWindow.setSize(MINI_W, MINI_H);
        setTimeout(() => { 
          if (!overlayWindow.isDestroyed()) overlayWindow.setHasShadow(true); 
        }, 50);
      }
      if (process.platform === 'darwin') {
        setTimeout(() => {
          if (!overlayWindow.isDestroyed()) overlayWindow.invalidateShadow();
        }, 50);
      }
    }
  });

  // Hotkey Suspension
  ipcMain.on('suspend-hotkeys', () => {
    globalShortcut.unregisterAll();
    uIOhook.removeAllListeners('keydown');
    uIOhook.removeAllListeners('keyup');
  });

  ipcMain.on('resume-hotkeys', () => {
    registerHotkeys(toggleListening);
  });

  // Microphone Management
  ipcMain.handle('get-mic-list', () => {
    return new Promise((resolve) => {
      const wsClient = getWsClient();
      if (!wsClient) { resolve([]); return; }
      if (pendingMicListResolve) pendingMicListResolve([]);
      pendingMicListResolve = resolve;
      wsClient.send(JSON.stringify({ command: 'get-devices' }));
      setTimeout(() => {
        if (pendingMicListResolve === resolve) {
          pendingMicListResolve = null;
          resolve([]);
        }
      }, 3000);
    });
  });

  ipcMain.on('set-mic', (event, deviceId) => {
    store.set('selectedMicId', deviceId || '');
    const wsClient = getWsClient();
    if (wsClient) {
      wsClient.send(JSON.stringify({ command: 'set-device', deviceId: deviceId || null }));
    }
  });

  // Text Replacement Import/Export
  ipcMain.handle('export-replacements', async (event) => {
    const replacements = store.get('textReplacements') || [];
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
      title: 'Export Text Replacements',
      defaultPath: 'juno-replacements.json',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, reason: 'canceled' };
    try {
      const payload = { schema: 1, exportedAt: new Date().toISOString(), replacements };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return { ok: true, count: replacements.length };
    } catch (e) { return { ok: false, reason: e.message }; }
  });

  ipcMain.handle('import-replacements-pick', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
      title: 'Import Text Replacements',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths || filePaths.length === 0) return { ok: false, reason: 'canceled' };
    try {
      const raw = fs.readFileSync(filePaths[0], 'utf8');
      const data = JSON.parse(raw);
      if (data.schema !== 1) return { ok: false, reason: 'invalid_schema' };
      if (!Array.isArray(data.replacements)) return { ok: false, reason: 'invalid_format' };
      const items = data.replacements
        .filter(r => typeof r.say === 'string' && typeof r.replace === 'string')
        .map(r => ({ say: r.say.trim(), replace: r.replace }));
      return { ok: true, items, count: items.length };
    } catch (e) { return { ok: false, reason: e.message }; }
  });

  ipcMain.handle('import-replacements-commit', (event, { items, mode }) => {
    if (!Array.isArray(items)) return { ok: false };
    if (mode === 'replace') {
      store.set('textReplacements', items);
    } else {
      const existing = store.get('textReplacements') || [];
      const existingKeys = new Set(existing.map(r => r.say.toLowerCase().trim()));
      const newItems = items.filter(r => !existingKeys.has(r.say.toLowerCase().trim()));
      store.set('textReplacements', [...existing, ...newItems]);
    }
    return { ok: true };
  });

  // Full Settings Import/Export
  ipcMain.handle('export-settings', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
      title: 'Export Juno Voice Settings',
      defaultPath: 'juno-settings-backup.json',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    try {
      const configToExport = { ...store.store };
      const privateKeys = ['overlayPosition', 'overlayMiniPosition', 'settingsPosition', 'licenseKey', 'licenseStatus', 'licensePurchase', 'firstLaunchDate', 'statsSessions', 'statsFirstDate', 'statsWords'];
      privateKeys.forEach(k => delete configToExport[k]);
      fs.writeFileSync(filePath, JSON.stringify(configToExport, null, 2), 'utf8');
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('import-settings-pick', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
      title: 'Import Juno Voice Settings',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
    try {
      const raw = fs.readFileSync(filePaths[0], 'utf8');
      const importedConfig = JSON.parse(raw);
      let conflicts = [];
      const isMac = process.platform === 'darwin';
      const checkShortcut = (str) => {
        if (!str) return false;
        const lower = str.toLowerCase();
        if (isMac && (lower.includes('win') || lower.includes('windows'))) return true;
        if (!isMac && (lower.includes('command') || lower.includes('cmd') || lower.includes('mac'))) return true;
        return false;
      };
      if (checkShortcut(importedConfig.hotkey)) conflicts.push(`Global Hotkey: ${importedConfig.hotkey}`);
      if (importedConfig.langHotkeys && Array.isArray(importedConfig.langHotkeys)) {
        importedConfig.langHotkeys.forEach(lh => { if (checkShortcut(lh.combo)) conflicts.push(`Language Hotkey (${lh.lang}): ${lh.combo}`); });
      }
      return { config: importedConfig, conflicts };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('import-settings-commit', (event, newConfig) => {
    try {
      const privateKeys = ['licenseKey', 'licenseStatus', 'licensePurchase', 'statsSessions', 'statsFirstDate', 'overlayPosition', 'overlayMiniPosition', 'settingsPosition'];
      for (const key in newConfig) {
        if (!privateKeys.includes(key)) store.set(key, newConfig[key]);
      }
      registerHotkeys(toggleListening);
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });
  
  // App Logic IPCs
  ipcMain.handle('app-factory-reset', () => {
    const keys = ['licenseKey', 'licenseStatus', 'licensePurchase', 'firstLaunchDate'];
    const backup = {};
    keys.forEach(k => backup[k] = store.get(k));
    store.clear();
    keys.forEach(k => { if(backup[k] !== undefined) store.set(k, backup[k]); });
    app.relaunch();
    app.quit();
  });
}

function handleMicListMessage(devices) {
  if (pendingMicListResolve) {
    pendingMicListResolve(devices);
    pendingMicListResolve = null;
  }
}

module.exports = { setupIpcHandlers, handleMicListMessage };
