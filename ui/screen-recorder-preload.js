const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenRecorder', {
  cancelRecording: () => ipcRenderer.send('srec-cancel-recording'),
  restartRecording: () => ipcRenderer.send('srec-restart-recording'),
  // Uint8Array is transferred as binary via structured clone — much more efficient than base64
  saveBlobReady:   (uint8Array) => ipcRenderer.invoke('srec-save-blob', uint8Array),
  openCamera:      () => ipcRenderer.send('srec-open-camera'),
  closeCamera:     () => ipcRenderer.send('srec-close-camera'),
  onCommand:       (cb) => ipcRenderer.on('srec-command', (_, cmd) => cb(cmd)),
  onStartInfo:     (cb) => ipcRenderer.on('srec-start-info', (_, info) => cb(info)),
  // Mouse position broadcast from main process at 60 fps (global screen coordinates)
  onMousePos:      (cb) => ipcRenderer.on('srec-mouse-pos', (_, x, y) => cb(x, y)),
});
