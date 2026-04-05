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
});
