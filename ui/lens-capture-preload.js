const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lensCapture', {
  onScreenshot:                 (cb) => ipcRenderer.on('lens-set-screenshot', (_, dataUrl) => cb(dataUrl)),
  selectRegion:                 (region)   => ipcRenderer.send('lens-region-selected', region),
  cancel:                       ()         => ipcRenderer.send('lens-capture-cancel'),
  fullScreenShot:               ()         => ipcRenderer.send('lens-fullscreen-screenshot'),
  openScreenRecorder:           (settings) => ipcRenderer.send('srec-open-from-capture', settings),
  openScreenRecorderFullScreen: (settings) => ipcRenderer.send('srec-fullscreen-from-capture', settings),
  openGallery:                  ()         => ipcRenderer.send('gallery-open'),
  getConfig:                    ()         => ipcRenderer.invoke('get-config'),
});
