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
  getSttEngineInfo: ()       => ipcRenderer.invoke('get-stt-engine-info'),
  getAvailableBrowsers: ()   => ipcRenderer.invoke('get-available-browsers'),
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
  onWhisperAiModeToggled:    (cb)         => onChannel('whisper-ai-mode-toggled', (_, on) => cb(on)),
  // ── Central API Vault ──
  vaultGetSummary:           ()           => ipcRenderer.invoke('vault-get-summary'),
  vaultGetLlmProfiles:       ()           => ipcRenderer.invoke('vault-get-llm-profiles'),
  vaultAddLlmProfile:        (p)          => ipcRenderer.invoke('vault-add-llm-profile', p),
  vaultUpdateLlmProfile:     (id, u)      => ipcRenderer.invoke('vault-update-llm-profile', { id, updates: u }),
  vaultRemoveLlmProfile:     (id)         => ipcRenderer.invoke('vault-remove-llm-profile', id),
  vaultGetWhisperProfiles:   ()           => ipcRenderer.invoke('vault-get-whisper-profiles'),
  vaultAddWhisperProfile:    (p)          => ipcRenderer.invoke('vault-add-whisper-profile', p),
  vaultUpdateWhisperProfile: (id, u)      => ipcRenderer.invoke('vault-update-whisper-profile', { id, updates: u }),
  vaultRemoveWhisperProfile: (id)         => ipcRenderer.invoke('vault-remove-whisper-profile', id),
  vaultGetDefaults:          ()           => ipcRenderer.invoke('vault-get-defaults'),
  vaultSetDefault:           (f, pid)     => ipcRenderer.invoke('vault-set-default', { feature: f, profileId: pid }),
  vaultGetDefaultForFeature: (f)          => ipcRenderer.invoke('vault-get-default-for-feature', f),
  vaultGetFallback:          ()           => ipcRenderer.invoke('vault-get-fallback'),
  vaultSetFallback:          (on)         => ipcRenderer.invoke('vault-set-fallback', on),
  // ── Cross-window navigation ──
  onNavigateToPanel:         (cb)         => onChannel('navigate-to-panel', (_, panelId) => cb(panelId)),
});
