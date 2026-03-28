const { contextBridge, ipcRenderer } = require('electron');

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
  onUpdateStatus:  (cb)     => ipcRenderer.on('update-status', (_, info) => cb(info)),
  verifyLicense:   (key)    => ipcRenderer.invoke('verify-license', key),
  onLicenseExpired:(cb)     => ipcRenderer.on('license-expired', () => cb())
});
