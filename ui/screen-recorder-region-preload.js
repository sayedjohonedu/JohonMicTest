const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('srecRegion', {
  selectRegion:   (region) => ipcRenderer.send('srec-region-selected', region),
  useFullScreen:  ()       => ipcRenderer.send('srec-fullscreen-selected'),
  cancel:         ()       => ipcRenderer.send('srec-region-cancel'),
});
