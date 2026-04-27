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

  // Project sidecar
  saveProject:      (filePath, data)        => ipcRenderer.invoke('veditor-save-project', { filePath, data }),
  loadProject:      (filePath)              => ipcRenderer.invoke('veditor-load-project', filePath),
  loadCursorTrack:  (filePath)              => ipcRenderer.invoke('veditor-load-cursor-track', filePath),

  // Events from main process
  onExportProgress: (cb) => ipcRenderer.on('veditor-export-progress', (_, data) => cb(data)),
  onExportDone:     (cb) => ipcRenderer.on('veditor-export-done', (_, data) => cb(data)),
});
