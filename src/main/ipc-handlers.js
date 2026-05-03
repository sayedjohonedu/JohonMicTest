const { ipcMain, dialog, BrowserWindow, shell, clipboard, app, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const store = require('../../store/config');
const { verifyLicense } = require('./licensing');
const { applyOverlaySize, getOverlayWindow, getSettingsWindow, OV, closeLicensePopup, closeWordLimitPopup, closeTranslatorLockedPopup, closeAiTrialPopup, showAiTrialExpiredPopup, showWhisperApiLockedPopup, closeWhisperApiLockedPopup, showLicenseCelebration, closeLicenseCelebration, closeScreenRecorderLockedPopup, closeLensLockedPopup } = require('./window-manager');
const { uIOhook } = require('uiohook-napi');
const { setupFloatingBrowserIpc } = require('./floating-browser-manager');
const { callLlmRaw, httpPost, httpGet } = require('./llm-client');
const { AiDictationManager, checkOllamaStatus } = require('./ai-dictation-manager');

let pendingMicListResolve = null;
const aiDictationManager = new AiDictationManager();

function setupIpcHandlers(toggleListening, registerHotkeys, getWsClient, resetSilenceTimer, showSettings, robustKeyTap, injectCharDirect, injectText, switchTrayLanguage, resetModifiers, _resetSilenceTimerForBrowser, translatorCtx) {
  
  setupFloatingBrowserIpc(_resetSilenceTimerForBrowser || resetSilenceTimer);
  if (translatorCtx) setupTranslatorIpc(translatorCtx, robustKeyTap, registerHotkeys, toggleListening);

  ipcMain.on('save-config', (event, config) => {
    // ── AI Trial enforcement: stamp first-enable date + block expired trials ──
    if (config.aiModeEnabled === true) {
      const { checkAiTrialExpiry } = require('./licensing');
      // Stamp first-enabled date if not already set
      if (!store.get('aiFirstEnabledDate')) {
        store.set('aiFirstEnabledDate', Date.now());
      }
      // Block if trial is expired
      const trial = checkAiTrialExpiry();
      if (trial.expired) {
        config.aiModeEnabled = false; // Force-disable
      }
    }


    store.set(config);
    registerHotkeys(toggleListening);

    if (config.autoLaunch !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: config.autoLaunch === true,
        path: app.getPath('exe')
      });
    }

    const wsClient = getWsClient();
    if (wsClient) {
      wsClient.send(JSON.stringify({ command: 'set-mic-sensitivity', sensitivity: config.micSensitivity || 1.0 }));
    }
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('config-updated', config);
      }
    });
  });

  ipcMain.handle('get-config', () => store.store);

  ipcMain.handle('get-stats', () => ({
    totalWords:    store.get('statsWords')     || 0,
    totalSessions: store.get('statsSessions')  || 0,
    langUsage:     store.get('statsLangUsage') || {},
    firstDate:     store.get('statsFirstDate') || 0,
    freeDailyWords: store.get('freeDailyWords') || 0,
  }));

  ipcMain.handle('get-license-info', () => ({
    status:               store.get('licenseStatus')       || 'trial',
    licenseActivatedDate: store.get('licenseActivatedDate') || 0,
    freeDailyWords:       store.get('freeDailyWords')       || 0,
    freeDailyReset:       store.get('freeDailyReset')       || 0,
    licensePurchase:      store.get('licensePurchase')      || {},
  }));

  ipcMain.on('overlay-stop', () => {
    // When user clicks X close, skip AI processing (discard buffer)
    const aiActive = store.get('aiModeEnabled') === true;
    toggleListening(null, false, false, aiActive);
  });

  // AI Dictation: user clicked "Send Now" — stop listening and process immediately
  ipcMain.on('ai-send-now', () => {
    if (store.get('aiModeEnabled') === true) {
      toggleListening(null, false, false, false); // skipAiProcessing = false → process buffer
    }
  });
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

  // Opens settings AND navigates to a specific panel (e.g. 'api-vault')
  ipcMain.on('open-settings-panel', (event, panelId) => {
    resetSilenceTimer();
    const sw = showSettings();
    if (sw) {
      sw.show();
      sw.focus();
      // Wait for the window to be ready before sending the navigate event
      const send = () => {
        if (!sw.isDestroyed()) sw.webContents.send('navigate-to-panel', panelId);
      };
      if (sw.webContents.isLoading()) {
        sw.webContents.once('did-finish-load', send);
      } else {
        // Already loaded — small delay to let JS settle
        setTimeout(send, 80);
      }
    }
  });
  ipcMain.on('close-license-popup', () => {
    if (typeof closeLicensePopup === 'function') {
      closeLicensePopup();
    }
  });
  ipcMain.on('close-wordlimit-popup', () => {
    if (typeof closeWordLimitPopup === 'function') closeWordLimitPopup();
  });
  ipcMain.on('close-translator-locked-popup', () => {
    if (typeof closeTranslatorLockedPopup === 'function') closeTranslatorLockedPopup();
  });
  ipcMain.on('close-ai-trial-popup', () => {
    if (typeof closeAiTrialPopup === 'function') closeAiTrialPopup();
  });
  ipcMain.on('close-offline-locked-popup', () => {
    if (typeof closeOfflineLockedPopup === 'function') closeOfflineLockedPopup();
  });
  ipcMain.on('close-whisper-api-locked-popup', () => {
    if (typeof closeWhisperApiLockedPopup === 'function') closeWhisperApiLockedPopup();
  });
  ipcMain.on('close-screen-recorder-locked-popup', () => {
    if (typeof closeScreenRecorderLockedPopup === 'function') closeScreenRecorderLockedPopup();
  });
  ipcMain.on('close-lens-locked-popup', () => {
    if (typeof closeLensLockedPopup === 'function') closeLensLockedPopup();
  });
  ipcMain.on('show-license-celebration', () => {
    showLicenseCelebration();
  });
  ipcMain.on('close-license-celebration', () => {
    if (typeof closeLicenseCelebration === 'function') closeLicenseCelebration();
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
    OV.emojiH = open ? 295 : 0;
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

  // Expose active STT engine info to UI (overlay pill, settings)
  ipcMain.handle('get-stt-engine-info', () => {
    const { getActiveBrowserInfo } = require('../../engine/chrome-launcher');
    const info = getActiveBrowserInfo();
    if (!info) return { name: 'Unknown', engine: 'unknown', engineLabel: 'Disconnected' };
    return { name: info.name, engine: info.engine, engineLabel: info.engineLabel };
  });

  // List all installed Chromium browsers for the settings dropdown
  ipcMain.handle('get-available-browsers', () => {
    const { findAllBrowsers } = require('../../engine/browser-finder');
    return findAllBrowsers();
  });

  // Restart the STT bridge with the newly saved preferred browser
  ipcMain.handle('restart-stt-bridge', async () => {
    const { launchChromeBridge, closeChromeBridge } = require('../../engine/chrome-launcher');
    try {
      await closeChromeBridge();
    } catch (e) {}
    // Small pause so the old browser process has time to fully close
    await new Promise(resolve => setTimeout(resolve, 600));
    const http = require('http');
    // Re-use the already running HTTP server's port — we need to look it up
    // from the module-level variable. We export a getter for it from main.js.
    const { getHttpPort } = require('../../engine/http-port');
    const port = getHttpPort();
    if (port) {
      launchChromeBridge(`http://localhost:${port}/speech-bridge.html?port=${port}`)
        .catch(e => console.error('[STT Bridge] Restart failed:', e));
    }
    return { ok: true };
  });

  ipcMain.on('check-updates', () => autoUpdater.checkForUpdates());
  ipcMain.on('download-update', () => autoUpdater.downloadUpdate());
  ipcMain.on('install-update', () => autoUpdater.quitAndInstall());

  // ── Update Reminder ──
  ipcMain.on('dismiss-update-reminder', () => {
    const { getLatestAvailableVersion } = require('./updater');
    const { closeUpdateReminderPopup } = require('./window-manager');
    const version = getLatestAvailableVersion();
    if (version) {
      store.set('updateReminderDismissedAt', Date.now());
      store.set('updateReminderVersion', version);
    }
    closeUpdateReminderPopup();
  });

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
      defaultPath: 'mictab-replacements.json',
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
      title: 'Export MicTab Settings',
      defaultPath: 'mictab-settings-backup.json',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    try {
      const configToExport = { ...store.store };
      const privateKeys = ['overlayPosition', 'overlayMiniPosition', 'settingsPosition', 'licenseKey', 'licenseStatus', 'licensePurchase', 'licenseActivatedDate', 'firstLaunchDate', 'aiFirstEnabledDate', 'offlineFirstEnabledDate', 'whisperApiFirstEnabledDate', 'statsSessions', 'statsFirstDate', 'statsWords'];
      privateKeys.forEach(k => delete configToExport[k]);
      fs.writeFileSync(filePath, JSON.stringify(configToExport, null, 2), 'utf8');
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('import-settings-pick', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
      title: 'Import MicTab Settings',
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
      const privateKeys = ['licenseKey', 'licenseStatus', 'licensePurchase', 'licenseActivatedDate', 'firstLaunchDate', 'aiFirstEnabledDate', 'offlineFirstEnabledDate', 'whisperApiFirstEnabledDate', 'statsSessions', 'statsFirstDate', 'overlayPosition', 'overlayMiniPosition', 'settingsPosition'];
      for (const key in newConfig) {
        if (!privateKeys.includes(key)) store.set(key, newConfig[key]);
      }
      registerHotkeys(toggleListening);
      
      if (newConfig.autoLaunch !== undefined) {
        app.setLoginItemSettings({
          openAtLogin: newConfig.autoLaunch === true,
          path: app.getPath('exe')
        });
      }
      
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

  /* ─── AI Dictation IPC ─────────────────────────────────────── */
  ipcMain.handle('ai-test-connection', async (event, profile) => {
    try {
      return await callLlmRaw({
        text: 'Say "connected" and nothing else.',
        profile,
        systemPrompt: 'Respond with a single word.',
        temperature: 0.1,
      });
    } catch (e) {
      return { error: e.message || 'Connection failed' };
    }
  });

  ipcMain.handle('ai-get-ollama-models', async () => {
    return await checkOllamaStatus();
  });

  ipcMain.handle('ai-get-status', () => ({
    enabled: store.get('aiModeEnabled') || false,
    processing: aiDictationManager.isProcessing(),
    bufferLength: aiDictationManager.getBufferedText().length,
  }));

  ipcMain.on('ai-reset-session', () => {
    aiDictationManager.resetSession();
  });

  // AI Trial: check if free user's 15-day AI trial has expired
  ipcMain.handle('ai-check-trial', () => {
    const { checkAiTrialExpiry } = require('./licensing');
    return checkAiTrialExpiry();
  });

  // AI Trial: show popup when trial is expired and user tries to enable
  ipcMain.on('ai-show-trial-popup', () => {
    showAiTrialExpiredPopup();
  });

  // Whisper API Trial: check if free user's 15-day Whisper API trial has expired
  ipcMain.handle('whisper-api-check-trial', () => {
    const { checkWhisperApiTrialExpiry } = require('./licensing');
    return checkWhisperApiTrialExpiry();
  });

  // Whisper API Trial: show popup when trial is expired and user tries to enable
  ipcMain.on('whisper-api-show-locked-popup', () => {
    showWhisperApiLockedPopup();
  });


  /* ── Shared audio IPC (used by Whisper API recording pipeline) ──── */
  const offlineRecorder = require('./offline-recorder');

  ipcMain.on('offline-audio-data', (event, data) => {
    offlineRecorder.onAudioDataReceived(data);
  });

  ipcMain.on('offline-cancel-recording', () => {
    offlineRecorder.cancelRecording();
    try {
      const whisperMgr = require('./whisper-api-manager');
      if (whisperMgr._isProcessing) {
        whisperMgr._isProcessing = false;
      }
    } catch (_) {}
  });

  /* ── Whisper API (Cloud) IPC ────────────────────────────────────── */
  const whisperApiEngine = require('./whisper-api-engine');
  const whisperApiManager = require('./whisper-api-manager');

  ipcMain.handle('whisper-api-enable', (event, enabled) => {
    if (enabled === true) {
      const { checkWhisperApiTrialExpiry } = require('./licensing');
      // Stamp first-enabled date if not already set
      if (!store.get('whisperApiFirstEnabledDate')) {
        store.set('whisperApiFirstEnabledDate', Date.now());
      }
      // Block if trial is expired
      const trial = checkWhisperApiTrialExpiry();
      if (trial.expired) {
        store.set('whisperApiEnabled', false);
        registerHotkeys(toggleListening);
        return { ok: false, trialExpired: true };
      }
    }
    store.set('whisperApiEnabled', enabled === true);
    // Re-register hotkeys so the whisper API hold-key gets added/removed
    registerHotkeys(toggleListening);
    return { ok: true };
  });

  ipcMain.handle('whisper-api-get-status', () => {
    return whisperApiManager.getStatus();
  });

  ipcMain.handle('whisper-api-set-config', (event, config) => {
    if (config.profiles !== undefined) store.set('whisperApiProfiles', config.profiles);
    if (config.activeProfileId !== undefined) store.set('whisperApiActiveProfileId', config.activeProfileId);
    if (config.fallbackEnabled !== undefined) store.set('whisperApiFallbackEnabled', config.fallbackEnabled);
    if (config.language !== undefined) store.set('whisperApiLanguage', config.language);
    return { ok: true };
  });

  ipcMain.handle('whisper-api-get-config', () => {
    return {
      enabled: store.get('whisperApiEnabled') === true,
      profiles: store.get('whisperApiProfiles') || [],
      activeProfileId: store.get('whisperApiActiveProfileId') || '',
      fallbackEnabled: store.get('whisperApiFallbackEnabled') !== false,
      language: store.get('whisperApiLanguage') || '',
      activationKey: store.get('whisperApiActivationKey') || (process.platform === 'darwin' ? 'MetaRight' : 'ControlRight'),
    };
  });

  ipcMain.handle('whisper-api-test-key', async (event, profile) => {
    // profile = { provider, apiKey, baseUrl }
    const provider = profile?.provider || 'openai';
    const apiKey = profile?.apiKey || '';
    return await whisperApiEngine.testApiKey(apiKey, provider);
  });

  ipcMain.handle('whisper-api-get-languages', () => {
    return whisperApiEngine.WHISPER_LANGUAGES;
  });

  ipcMain.handle('whisper-api-get-providers', () => {
    return whisperApiEngine.PROVIDERS;
  });

  ipcMain.handle('whisper-api-set-key', (event, keyCode) => {
    store.set('whisperApiActivationKey', keyCode);
    registerHotkeys(toggleListening);
    return { ok: true };
  });

  /* ── Whisper API — AI Post-Processing IPC ──────────────────────── */

  ipcMain.handle('whisper-api-ai-enable', (event, enabled) => {
    const newState = enabled === true;
    store.set('whisperApiAiEnabled', newState);
    // Sync pill badge when the settings toggle changes AI mode
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send('whisper-ai-mode-pill', newState);
    });
    return { ok: true };
  });

  ipcMain.handle('whisper-api-ai-get-config', () => {
    return {
      enabled:         store.get('whisperApiAiEnabled') === true,
      profiles:        store.get('whisperApiAiProfiles') || [],
      activeProfileId: store.get('whisperApiAiActiveProfileId') || '',
      systemPrompt:    store.get('whisperApiAiSystemPrompt') || '',
      temperature:     store.get('whisperApiAiTemperature') ?? 0.3,
      fallbackEnabled: store.get('whisperApiAiFallbackEnabled') !== false,
    };
  });

  ipcMain.handle('whisper-api-ai-set-config', (event, cfg) => {
    if (cfg.profiles !== undefined) store.set('whisperApiAiProfiles', cfg.profiles);
    if (cfg.activeProfileId !== undefined) store.set('whisperApiAiActiveProfileId', cfg.activeProfileId);
    if (cfg.systemPrompt !== undefined) store.set('whisperApiAiSystemPrompt', cfg.systemPrompt);
    if (cfg.temperature !== undefined) store.set('whisperApiAiTemperature', cfg.temperature);
    if (cfg.fallbackEnabled !== undefined) store.set('whisperApiAiFallbackEnabled', cfg.fallbackEnabled);
    return { ok: true };
  });

  ipcMain.handle('whisper-api-ai-test', async (event, profile) => {
    try {
      return await callLlmRaw({
        text: 'Say "connected" and nothing else.',
        profile,
        systemPrompt: 'Respond with a single word.',
        temperature: 0.1,
      });
    } catch (e) {
      return { error: e.message || 'Connection failed' };
    }
  });

  /* ═══════════════════════════════════════════════════════════════
     ██  CENTRAL API VAULT — IPC HANDLERS
     ═══════════════════════════════════════════════════════════════ */
  const apiVault = require('./api-vault');

  // Broadcast vault changes to ALL open windows so renderers can refresh their caches
  function broadcastVaultUpdate() {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('vault-updated');
    });
  }

  // Get the full vault summary (counts, defaults, feature info)
  ipcMain.handle('vault-get-summary', () => apiVault.getSummary());

  // ── LLM Profiles ──────────────────────────────────────────────
  ipcMain.handle('vault-get-llm-profiles', () => apiVault.getLlmProfiles());

  ipcMain.handle('vault-add-llm-profile', (event, profile) => {
    const p = apiVault.addLlmProfile(profile);
    broadcastVaultUpdate();
    return { ok: true, profile: p };
  });

  ipcMain.handle('vault-update-llm-profile', (event, { id, updates }) => {
    const p = apiVault.updateLlmProfile(id, updates);
    broadcastVaultUpdate();
    return p ? { ok: true, profile: p } : { ok: false, error: 'Profile not found' };
  });

  ipcMain.handle('vault-remove-llm-profile', (event, id) => {
    apiVault.removeLlmProfile(id);
    broadcastVaultUpdate();
    return { ok: true };
  });

  // ── Whisper Profiles ──────────────────────────────────────────
  ipcMain.handle('vault-get-whisper-profiles', () => apiVault.getWhisperProfiles());

  ipcMain.handle('vault-add-whisper-profile', (event, profile) => {
    const p = apiVault.addWhisperProfile(profile);
    broadcastVaultUpdate();
    return { ok: true, profile: p };
  });

  ipcMain.handle('vault-update-whisper-profile', (event, { id, updates }) => {
    const p = apiVault.updateWhisperProfile(id, updates);
    broadcastVaultUpdate();
    return p ? { ok: true, profile: p } : { ok: false, error: 'Profile not found' };
  });

  ipcMain.handle('vault-remove-whisper-profile', (event, id) => {
    apiVault.removeWhisperProfile(id);
    broadcastVaultUpdate();
    return { ok: true };
  });

  // ── Feature Defaults ──────────────────────────────────────────
  ipcMain.handle('vault-get-defaults', () => apiVault.getAllDefaults());

  ipcMain.handle('vault-set-default', (event, { feature, profileId }) => {
    apiVault.setDefaultForFeature(feature, profileId);
    broadcastVaultUpdate();
    return { ok: true };
  });

  ipcMain.handle('vault-get-default-for-feature', (event, feature) => {
    return apiVault.getDefaultForFeature(feature);
  });

  // ── Fallback Toggle ───────────────────────────────────────────
  ipcMain.handle('vault-get-fallback', () => apiVault.fallbackEnabled);

  ipcMain.handle('vault-set-fallback', (event, enabled) => {
    apiVault.fallbackEnabled = enabled;
    broadcastVaultUpdate();
    return { ok: true };
  });

  // ── Legacy-compat: also update whisper profile storage on vault changes ──
  // (The Settings UI Whisper panel still reads whisperApiProfiles for status/key)
  ipcMain.handle('vault-sync-whisper-config', (event, config) => {
    if (config.profiles !== undefined) store.set('whisperApiProfiles', config.profiles);
    if (config.activeProfileId !== undefined) store.set('whisperApiActiveProfileId', config.activeProfileId);
    if (config.fallbackEnabled !== undefined) store.set('whisperApiFallbackEnabled', config.fallbackEnabled);
    return { ok: true };
  });

  /* ═══════════════════════════════════════════════════════════════
     ██  VOICE AGENTS — IPC HANDLERS
     ═══════════════════════════════════════════════════════════════ */
  const agentEngine = require('./agent-pipeline-engine');

  ipcMain.handle('agents-get-all', () => agentEngine.getAgents());

  ipcMain.handle('agents-add', (event, agentData) => {
    const agent = agentEngine.addAgent(agentData);
    broadcastAgentUpdate();
    return { ok: true, agent };
  });

  ipcMain.handle('agents-update', (event, { id, updates }) => {
    const agent = agentEngine.updateAgent(id, updates);
    broadcastAgentUpdate();
    return agent ? { ok: true, agent } : { ok: false, error: 'Agent not found' };
  });

  ipcMain.handle('agents-delete', (event, id) => {
    const ok = agentEngine.deleteAgent(id);
    if (ok) broadcastAgentUpdate();
    return { ok, error: ok ? undefined : 'Cannot delete built-in agent' };
  });

  ipcMain.handle('agents-reset-jarvis', () => {
    agentEngine.resetJarvis();
    broadcastAgentUpdate();
    return { ok: true };
  });

  ipcMain.handle('agents-reorder', (event, orderedIds) => {
    const agents = agentEngine.reorderAgents(orderedIds);
    broadcastAgentUpdate();
    return { ok: true, agents };
  });


  // Broadcast agent changes to all windows so renderers can refresh
  function broadcastAgentUpdate() {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send('agents-updated');
    });
  }

  // ── Browse for file (used by file-system block) ──
  ipcMain.handle('agents-browse-file', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
      title: 'Select a File',
      properties: ['openFile'],
    });
    if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
    return { path: filePaths[0] };
  });

  // ── Enable JavaScript blocks ──
  ipcMain.handle('agents-enable-js', () => {
    const existing = store.get('voiceAgentsConfig') || {};
    store.set('voiceAgentsConfig', { ...existing, jsEnabled: true });
    return { ok: true };
  });

  // ── Run Agent Test — executes buildPipeline + real LLM call ──
  ipcMain.handle('agents-run-test', async (event, { agentId, testInput, testValues }) => {
    try {
      const agent = agentEngine.getAgents().find(a => a.id === agentId);
      if (!agent) return { ok: false, error: 'Agent not found' };

      // Inject test values into the pipeline context by temporarily patching
      // clipboard / selected-text via testValues map (keyed as blockId:token).
      // We pass them via a patched agent copy so no real clipboard is touched.
      const agentCopy = JSON.parse(JSON.stringify(agent));

      // Run the pipeline (resolves all chips, datetime, HTTP, shell, etc.)
      const pipeline = await agentEngine.buildPipeline(
        { ...agentCopy, _testValues: testValues || {} },
        testInput || '',
        { language: store.get('language') || 'en-US' }
      );

      const { systemPrompt, userMessage, profileId } = pipeline;

      // Resolve the LLM profile: agent profile → vault ai-dictation default → first profile
      let profile = null;
      const vault = require('./api-vault');
      if (profileId) profile = vault.getLlmProfile(profileId);
      if (!profile)  profile = vault.getDefaultForFeature('ai-dictation');
      if (!profile)  profile = vault.getLlmProfiles()[0] || null;

      if (!profile) {
        return {
          ok: false,
          error: 'No LLM profile configured. Please add an API profile in AI & API settings.',
          pipeline: { systemPrompt, userMessage },
        };
      }

      // Call the LLM
      const result = await callLlmRaw({
        text: userMessage,
        profile,
        systemPrompt,
        temperature: agent.temperature ?? 0.3,
      });

      if (result.error) {
        return { ok: false, error: result.error, pipeline: { systemPrompt, userMessage } };
      }

      return {
        ok: true,
        output: result.text,
        pipeline: { systemPrompt, userMessage },
        profileName: profile.name || profile.provider,
      };
    } catch (err) {
      console.error('[agents-run-test] Error:', err);
      return { ok: false, error: err.message || 'Test failed' };
    }
  });

  // ── Open / Close Voice Agents Window ──
  const { showVoiceAgents, closeVoiceAgents } = require('./window-manager');

  ipcMain.on('open-voice-agents', () => {
    showVoiceAgents();
  });

  ipcMain.on('close-voice-agents-window', () => {
    closeVoiceAgents();
  });
}

function handleMicListMessage(devices) {
  if (pendingMicListResolve) {
    pendingMicListResolve(devices);
    pendingMicListResolve = null;
  }
}

/* ─── Translator IPC ──────────────────────────────────────────── */
function setupTranslatorIpc({ openTranslator, closeTranslatorAndRestoreOverlay, toggleListening: tglListen }, robustKeyTap, registerHotkeys, mainToggleListening) {
  const KBD_MOD = process.platform === 'darwin' ? 'command' : 'control';

  // Translate — Regular (google-translate-api-x) or AI (LLM)
  ipcMain.handle('translator-do-translate', async (event, payload) => {
    const { text, src, tgt, mode, profile, systemPrompt, systemInstructions } = payload;
    if (mode === 'ai' && profile) {
      return await callLlmTranslate({ text, tgt, profile, systemPrompt, systemInstructions });
    } else {
      return await callGoogleTranslate({ text, src, tgt });
    }
  });

  // Humanize — AI only
  ipcMain.handle('translator-do-humanize', async (event, { text, profile, systemInstructions }) => {
    if (!profile) return { error: 'No API profile configured' };
    const prompt = 'Rewrite the following text to sound more natural, human, and conversational. Preserve the original meaning and keep it in the same language. Do not translate or change the language.';
    return await callLlmRaw({ text, profile, systemPrompt: prompt, systemInstructions });
  });

  // Paste output to last focused app
  // Strategy: hide/minimize translator briefly so the target app regains focus, then paste
  ipcMain.on('translator-paste-output', (event, text) => {
    if (!text) return;
    const { app } = require('electron');
    const translatorManager = require('./translator-manager');
    const clipboardManager = require('./clipboard-manager');
    const tw = translatorManager.getTranslatorWindow();
    
    if (tw && !tw.isDestroyed()) {
      if (process.platform === 'darwin') {
        app.hide(); // Yield focus to the underlying macOS app 
      } else {
        tw.minimize(); // On Windows, minimizing reliably returns focus to the previous active app
        tw.hide();     // Hide it off-screen to avoid taskbar flicker if possible
      }
      setTimeout(() => {
        clipboardManager.injectText(text);
        setTimeout(() => {
          if (process.platform === 'darwin') {
            app.show();
          } else {
            if (tw && !tw.isDestroyed()) {
              tw.restore(); // Undo the minimize on Windows
            }
          }
          if (tw && !tw.isDestroyed()) tw.show();
        }, 150); // delay before restoring translator
      }, 200); // delay to let OS focus transfer complete
    } else {
      clipboardManager.injectText(text);
    }
  });

  // Toggle STT from translator mic button
  ipcMain.on('translator-toggle-listening', (event, opts = {}) => {
    if (typeof tglListen === 'function') {
      tglListen(opts.lang || 'auto', true, opts.forceStart || false);
    }
  });

  // Close translator
  ipcMain.on('translator-close', () => closeTranslatorAndRestoreOverlay());

  // Minimize and maximize
  ipcMain.on('translator-minimize', () => {
    const translatorManager = require('./translator-manager');
    const tw = translatorManager.getTranslatorWindow();
    if (tw && !tw.isDestroyed()) tw.minimize();
  });
  
  ipcMain.on('translator-maximize', () => {
    const translatorManager = require('./translator-manager');
    const tw = translatorManager.getTranslatorWindow();
    if (tw && !tw.isDestroyed()) {
      if (tw.isMaximized()) {
        tw.unmaximize();
      } else {
        tw.maximize();
      }
    }
  });

  // Open translator from overlay button
  ipcMain.on('open-translator', () => openTranslator());

  // Save settings (partial update)
  ipcMain.handle('translator-save-settings', (event, updates) => {
    if (updates && typeof updates === 'object') {
      Object.keys(updates).forEach(k => store.set(k, updates[k]));

      if (updates.translatorOpenShortcut !== undefined || updates.translatorPasteShortcut !== undefined) {
        if (registerHotkeys && mainToggleListening) {
          registerHotkeys(mainToggleListening);
        }
      }
    }
    return true;
  });

  // Save one history entry
  ipcMain.handle('translator-save-history', (event, entry) => {
    const history = store.get('translatorHistory') || [];
    history.unshift(entry);
    if (history.length > 200) history.pop();
    store.set('translatorHistory', history);
    return true;
  });

  // Clear history
  ipcMain.on('translator-clear-history', () => {
    store.set('translatorHistory', []);
  });

  // Save language presets
  ipcMain.handle('translator-save-presets', (event, presets) => {
    store.set('translatorLangPresets', presets);
    return true;
  });
}

/* ─── Translation helpers ─────────────────────────────────────── */
async function callGoogleTranslate({ text, src, tgt }) {
  try {
    let translate;
    try {
      translate = require('google-translate-api-x');
    } catch (e) {
      return { error: 'google-translate-api-x not installed. Run: npm install google-translate-api-x' };
    }
    // Must pass 'auto' explicitly — passing undefined crashes the API
    const fromLang = (!src || src === 'auto') ? 'auto' : src;
    const res = await translate(text, { from: fromLang, to: tgt });
    return { text: res.text };
  } catch (e) {
    console.error('Google Translate error:', e);
    return { error: e.message || 'Translation failed' };
  }
}

async function callLlmTranslate({ text, tgt, profile, systemPrompt, systemInstructions }) {
  const langNames = {
    'en':'English','bn':'Bengali','es':'Spanish','fr':'French','de':'German','it':'Italian',
    'pt':'Portuguese','ru':'Russian','ja':'Japanese','ko':'Korean','zh-CN':'Chinese (Simplified)',
    'zh-TW':'Chinese (Traditional)','ar':'Arabic','hi':'Hindi','tr':'Turkish','pl':'Polish',
    'nl':'Dutch','sv':'Swedish','da':'Danish','fi':'Finnish','no':'Norwegian','uk':'Ukrainian',
    'vi':'Vietnamese','th':'Thai','id':'Indonesian','ms':'Malay','fa':'Persian','ur':'Urdu',
    'he':'Hebrew','ro':'Romanian','hu':'Hungarian','cs':'Czech','el':'Greek','bg':'Bulgarian',
  };
  const targetLanguage = langNames[tgt] || tgt;

  const sysPrompt = (systemPrompt || 'Translate the following text into {targetLanguage}. Preserve tone and formatting. Do not add explanations.')
    .replace('{targetLanguage}', targetLanguage);

  return await callLlmRaw({ text, profile, systemPrompt: sysPrompt, systemInstructions });
}

// callLlmRaw and httpPost are now imported from ./llm-client.js
// See: src/main/llm-client.js

module.exports = { setupIpcHandlers, handleMicListMessage, aiDictationManager };
