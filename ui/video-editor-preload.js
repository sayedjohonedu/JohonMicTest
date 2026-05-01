const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('veditor', {
  // Window controls
  close:            ()                      => ipcRenderer.send('veditor-close'),
  minimize:         ()                      => ipcRenderer.send('veditor-minimize'),
  maximize:         ()                      => ipcRenderer.send('veditor-maximize'),

  // FFmpeg / export
  checkFFmpeg:      ()                      => ipcRenderer.invoke('gallery-check-ffmpeg'),
  downloadFFmpeg:   ()                      => ipcRenderer.invoke('gallery-download-ffmpeg'),
  exportVideo:      (opts)                  => ipcRenderer.invoke('veditor-export', opts),
  cancelExport:     ()                      => ipcRenderer.send('veditor-cancel-export'),

  // Canvas frame-by-frame export (for dynamic zoom)
  startFrameExport: (opts)                  => ipcRenderer.invoke('veditor-start-frame-export', opts),
  sendExportFrame:  (frameData)             => ipcRenderer.invoke('veditor-send-frame', frameData),
  finishFrameExport:()                      => ipcRenderer.invoke('veditor-finish-frame-export'),

  // Project sidecar
  saveProject:      (filePath, data)        => ipcRenderer.invoke('veditor-save-project', { filePath, data }),
  loadProject:      (filePath)              => ipcRenderer.invoke('veditor-load-project', filePath),
  loadCursorTrack:  (filePath)              => ipcRenderer.invoke('veditor-load-cursor-track', filePath),

  // Events from main process
  onExportProgress: (cb) => ipcRenderer.on('veditor-export-progress', (_, data) => cb(data)),
  onExportDone:     (cb) => ipcRenderer.on('veditor-export-done', (_, data) => cb(data)),

  // Theme / config
  getConfig:        ()   => ipcRenderer.invoke('get-config'),
  onConfigUpdate:   (cb) => ipcRenderer.on('config-updated', (_, data) => cb(data)),
  
  // Hardware info
  getHardwareInfo:  ()   => ipcRenderer.invoke('veditor-get-hardware-info'),
});
