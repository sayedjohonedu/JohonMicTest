const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gallery', {
  // File operations
  scanFiles:        ()                      => ipcRenderer.invoke('gallery-scan-files'),
  renameFile:       (oldPath, newName)       => ipcRenderer.invoke('gallery-rename-file', { oldPath, newName }),
  deleteFile:       (filePath)              => ipcRenderer.invoke('gallery-delete-file', filePath),
  revealInFinder:   (filePath)              => ipcRenderer.send('gallery-reveal-in-finder', filePath),
  getSaveDir:       ()                      => ipcRenderer.invoke('gallery-get-save-dir'),

  // FFmpeg / conversion
  checkFFmpeg:      ()                      => ipcRenderer.invoke('gallery-check-ffmpeg'),
  downloadFFmpeg:   ()                      => ipcRenderer.invoke('gallery-download-ffmpeg'),
  onFFmpegProgress: (cb)                    => ipcRenderer.on('ffmpeg-download-progress', (_, data) => cb(data)),
  convertFile:      (filePath, format)      => ipcRenderer.invoke('gallery-convert-file', { filePath, format }),

  // Video Editor
  openEditor:       (filePath)              => ipcRenderer.send('veditor-open', filePath),

  // Open image in Lens Editor (for annotation/editing)
  openInLens:       (filePath)              => ipcRenderer.send('gallery-open-in-lens', filePath),

  // Window controls
  close:            ()                      => ipcRenderer.send('gallery-close'),
  minimize:         ()                      => ipcRenderer.send('gallery-minimize'),
  maximize:         ()                      => ipcRenderer.send('gallery-maximize'),

  // Events from main process
  onFileList:       (cb) => ipcRenderer.on('gallery-file-list', (_, files) => cb(files)),
  onNavigateToFile: (cb) => ipcRenderer.on('gallery-navigate-to-file', (_, filePath) => cb(filePath)),

  // Theme / config
  getConfig:        ()   => ipcRenderer.invoke('get-config'),
  onConfigUpdate:   (cb) => ipcRenderer.on('config-updated', (_, data) => cb(data)),
});
