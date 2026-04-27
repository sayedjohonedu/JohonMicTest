const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('srecCamera', {
  close: () => ipcRenderer.send('srec-close-camera'),
});
