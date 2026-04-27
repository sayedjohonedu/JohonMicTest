const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenRecorderCapture', {
  onScreenshot:  (cb) => ipcRenderer.on('srec-set-screenshot', (_, dataUrl) => cb(dataUrl)),
  selectRegion:  (region) => ipcRenderer.send('srec-region-selected', region),
  cancel:        () => ipcRenderer.send('srec-capture-cancel'),
  getMediaSources: () => ipcRenderer.invoke('srec-get-media-sources'),
});
