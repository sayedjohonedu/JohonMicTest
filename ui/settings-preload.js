const { contextBridge, ipcRenderer } = require('electron');

// Helper: remove any stale listener for a channel before adding the new one.
// This prevents duplicate event firings when the settings window is reopened.
function onChannel(channel, cb) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, cb);
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform:        process.platform,
  saveConfig:      (config) => ipcRenderer.send('save-config', config),
  getConfig:       ()       => ipcRenderer.invoke('get-config'),
  suspendHotkeys:  ()       => ipcRenderer.send('suspend-hotkeys'),
  resumeHotkeys:   ()       => ipcRenderer.send('resume-hotkeys'),
  openUrl:         (url)    => ipcRenderer.send('open-url', url),
  checkUpdates:    ()       => ipcRenderer.send('check-updates'),
  downloadUpdate:  ()       => ipcRenderer.send('download-update'),
  installUpdate:   ()       => ipcRenderer.send('install-update'),
  getVersion:      ()       => ipcRenderer.invoke('get-version'),
  onUpdateStatus:  (cb)     => onChannel('update-status',   (_, info) => cb(info)),
  verifyLicense:             (key)        => ipcRenderer.invoke('verify-license',              key),
  onLicenseExpired:          (cb)         => onChannel('license-expired', () => cb()),
  getStats:                  ()           => ipcRenderer.invoke('get-stats'),
  exportReplacements:        ()           => ipcRenderer.invoke('export-replacements'),
  importReplacementsPick:    ()           => ipcRenderer.invoke('import-replacements-pick'),
  importReplacementsCommit:  (payload)    => ipcRenderer.invoke('import-replacements-commit', payload),
  exportSettings:            ()           => ipcRenderer.invoke('export-settings'),
  importSettingsPick:        ()           => ipcRenderer.invoke('import-settings-pick'),
  importSettingsCommit:      (payload)    => ipcRenderer.invoke('import-settings-commit', payload),
  factoryReset:              ()           => ipcRenderer.invoke('app-factory-reset'),
  hardResetBrowser:          ()           => ipcRenderer.invoke('floating-browser-hard-reset'),
  getMicList:                ()           => ipcRenderer.invoke('get-mic-list'),
  setMic:                    (deviceId)   => ipcRenderer.send('set-mic', deviceId),
  getLicenseInfo:            ()           => ipcRenderer.invoke('get-license-info'),
  // ── AI Dictation ──
  aiTestConnection:          (profile)    => ipcRenderer.invoke('ai-test-connection', profile),
  aiGetOllamaModels:         ()           => ipcRenderer.invoke('ai-get-ollama-models'),
  aiGetStatus:               ()           => ipcRenderer.invoke('ai-get-status'),
  aiResetSession:            ()           => ipcRenderer.send('ai-reset-session'),
  aiCheckTrial:              ()           => ipcRenderer.invoke('ai-check-trial'),
  aiShowTrialPopup:          ()           => ipcRenderer.send('ai-show-trial-popup'),
  showLicenseCelebration:    ()           => ipcRenderer.send('show-license-celebration'),
  // ── Clipboard Manager ──
  cbSetEnabled:              (enabled)    => ipcRenderer.invoke('cb-set-enabled', enabled),
  // ── Offline Mode ──
  offlineCheckTrial:           ()           => ipcRenderer.invoke('offline-check-trial'),
  offlineShowLockedPopup:      ()           => ipcRenderer.send('offline-show-locked-popup'),
  offlineGetStatus:          ()           => ipcRenderer.invoke('offline-get-status'),
  offlineEnable:             (enabled)    => ipcRenderer.invoke('offline-enable', enabled),
  offlineLlmEnable:          (enabled)    => ipcRenderer.invoke('offline-llm-enable', enabled),
  offlineDownloadModel:      (opts)       => ipcRenderer.invoke('offline-download-model', opts),
  offlineDeleteModel:        (modelPath)  => ipcRenderer.invoke('offline-delete-model', modelPath),
  offlineLoadSttModel:       (modelPath)  => ipcRenderer.invoke('offline-load-stt-model', modelPath),
  offlineLoadLlmModel:       (modelPath)  => ipcRenderer.invoke('offline-load-llm-model', modelPath),
  offlineSetKey:             (keyCode)    => ipcRenderer.invoke('offline-set-key', keyCode),
  offlineSetSystemPrompt:    (prompt)     => ipcRenderer.invoke('offline-set-system-prompt', prompt),
  offlineGetSystemPrompt:    ()           => ipcRenderer.invoke('offline-get-system-prompt'),
  offlineOpenModelsFolder:   (type)       => ipcRenderer.invoke('offline-open-models-folder', type),
  onOfflineDownloadProgress: (cb)         => onChannel('offline-download-progress', (_, data) => cb(data)),
  // ── Whisper API (Cloud) ──
  whisperApiCheckTrial:        ()           => ipcRenderer.invoke('whisper-api-check-trial'),
  whisperApiShowLockedPopup:   ()           => ipcRenderer.send('whisper-api-show-locked-popup'),
  whisperApiEnable:          (on)         => ipcRenderer.invoke('whisper-api-enable', on),
  whisperApiGetStatus:       ()           => ipcRenderer.invoke('whisper-api-get-status'),
  whisperApiTestKey:         (profile)    => ipcRenderer.invoke('whisper-api-test-key', profile),
  whisperApiSetConfig:       (cfg)        => ipcRenderer.invoke('whisper-api-set-config', cfg),
  whisperApiGetConfig:       ()           => ipcRenderer.invoke('whisper-api-get-config'),
  whisperApiGetLanguages:    ()           => ipcRenderer.invoke('whisper-api-get-languages'),
  whisperApiGetProviders:    ()           => ipcRenderer.invoke('whisper-api-get-providers'),
  whisperApiSetKey:          (keyCode)    => ipcRenderer.invoke('whisper-api-set-key', keyCode),
  // ── Whisper API — AI Post-Processing ──
  whisperApiAiEnable:        (on)         => ipcRenderer.invoke('whisper-api-ai-enable', on),
  whisperApiAiGetConfig:     ()           => ipcRenderer.invoke('whisper-api-ai-get-config'),
  whisperApiAiSetConfig:     (cfg)        => ipcRenderer.invoke('whisper-api-ai-set-config', cfg),
  whisperApiAiTest:          (profile)    => ipcRenderer.invoke('whisper-api-ai-test', profile),
  // ── Live sync (hotkey toggles while settings is open) ──
  onConfigUpdate:            (cb)         => onChannel('config-updated', (_, cfg) => cb(cfg)),
  onAiModeToggled:           (cb)         => onChannel('ai-mode-toggled', (_, on) => cb(on)),
});
