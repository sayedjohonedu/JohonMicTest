const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridgeErrorAPI', {
  openExternal: (url) => ipcRenderer.send('bridge-error-open-url', url),
  closeWindow: () => ipcRenderer.send('bridge-error-close')
});
