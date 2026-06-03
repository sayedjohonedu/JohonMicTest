const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bridgeAPI', {
  openUrl: (url) => ipcRenderer.send('open-url', url)
});
