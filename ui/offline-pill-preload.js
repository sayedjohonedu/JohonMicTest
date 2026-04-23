const { contextBridge, ipcRenderer } = require('electron');

function onChannel(channel, cb) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, cb);
}

contextBridge.exposeInMainWorld('offlineAPI', {
  platform: process.platform,

  // Recording control (from main → renderer)
  onStartRecording:  (cb) => onChannel('offline-start-recording', () => cb()),
  onStopRecording:   (cb) => onChannel('offline-stop-recording',  () => cb()),

  // Audio data (from renderer → main)
  sendAudioData:     (data) => ipcRenderer.send('offline-audio-data', data),

  // Pill state (from main → renderer)
  onPillState:       (cb) => onChannel('offline-pill-state', (_, data) => cb(data)),

  // Config
  getConfig:         () => ipcRenderer.invoke('get-config'),

  // Listen for config updates (visualizer type changes, etc.)
  onConfigUpdate:    (cb) => onChannel('config-updated', (_, cfg) => cb(cfg)),

  // Cancel recording (from close button)
  cancelRecording:   () => ipcRenderer.send('offline-cancel-recording'),

  // Position persistence
  savePosition:      (pos) => ipcRenderer.send('offline-pill-save-position', pos),
});
