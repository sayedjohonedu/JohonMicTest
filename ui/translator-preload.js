'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function on(channel, cb) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_, data) => cb(data));
}

contextBridge.exposeInMainWorld('translatorAPI', {
  // Config
  getConfig:    () => ipcRenderer.invoke('get-config'),
  saveSettings: (data) => ipcRenderer.invoke('translator-save-settings', data),

  // Translation
  translate:    (payload) => ipcRenderer.invoke('translator-do-translate', payload),
  humanize:     (payload) => ipcRenderer.invoke('translator-do-humanize', payload),

  // Paste
  pasteOutput:  (text) => ipcRenderer.send('translator-paste-output', text),

  // Window
  close:        () => ipcRenderer.send('translator-close'),
  minimize:     () => ipcRenderer.send('translator-minimize'),
  maximize:     () => ipcRenderer.send('translator-maximize'),
  drag:         () => ipcRenderer.send('window-drag'),
  stopDrag:     () => ipcRenderer.send('window-drag-stop'),

  // History
  saveHistory:  (entry) => ipcRenderer.invoke('translator-save-history', entry),
  clearHistory: () => ipcRenderer.send('translator-clear-history'),

  // Language Presets
  savePresets:  (presets) => ipcRenderer.invoke('translator-save-presets', presets),

  // STT control from translator panel
  toggleListening: (opts) => ipcRenderer.send('translator-toggle-listening', opts || {}),

  // Listeners (from main → renderer)
  onTranscript:  (cb) => on('translator-transcript', cb),
  onInterim:     (cb) => on('translator-interim', cb),
  onAutoAction:  (cb) => on('translator-silence-auto', cb),
  onAudioData:   (cb) => on('translator-audio-data', cb),
  onPaste:       (cb) => on('translator-do-paste', cb),
  onSttState:    (cb) => on('translator-stt-state', cb),
  onAutoStart:   (cb) => on('translator-auto-start', cb),
  onConfigUpdate: (cb) => on('config-updated', cb),

  // ── Central API Vault ──
  vaultGetLlmProfiles:       () => ipcRenderer.invoke('vault-get-llm-profiles'),
  vaultGetDefaultForFeature: (f) => ipcRenderer.invoke('vault-get-default-for-feature', f),
  vaultSetDefault:           (f, pid) => ipcRenderer.invoke('vault-set-default', { feature: f, profileId: pid }),
  vaultGetSummary:           () => ipcRenderer.invoke('vault-get-summary'),
  onVaultUpdate:             (cb) => on('vault-updated', cb),
  openSettings:              (panel) => ipcRenderer.send('open-settings-panel', panel),

  // Edge TTS
  edgeTtsGetVoices: () => ipcRenderer.invoke('msedge-tts:get-voices'),
  edgeTtsSynthesize: (text, voiceShortName) => ipcRenderer.invoke('msedge-tts:synthesize', text, voiceShortName),
  edgeTtsDownload: (text, voiceShortName) => ipcRenderer.invoke('msedge-tts:download', text, voiceShortName)
});
