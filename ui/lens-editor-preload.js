const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lensEditor', {
  onLoadImage:      (cb)          => ipcRenderer.on('lens-load-image', (_, dataUrl) => cb(dataUrl)),
  onAutoSave:       (cb)          => ipcRenderer.on('lens-auto-save', () => cb()),
  onSetOriginPath:  (cb)          => ipcRenderer.on('lens-set-origin-path', (_, p) => cb(p)),
  saveImage:        (dataUrl)     => ipcRenderer.invoke('lens-save-image', dataUrl),
  saveOverwrite:    (dataUrl, filePath) => ipcRenderer.invoke('lens-save-overwrite', { dataUrl, filePath }),
  copyImage:        (dataUrl)     => ipcRenderer.send('lens-copy-image', dataUrl),
  closeEditor:      ()            => ipcRenderer.send('lens-close-editor'),
  translate:        (payload)     => ipcRenderer.invoke('lens-translate', payload),
  extractText:      (payload)     => ipcRenderer.invoke('lens-ocr', payload),
  markDirty:        ()            => ipcRenderer.send('lens-mark-dirty'),
  markClean:        ()            => ipcRenderer.send('lens-mark-clean'),
  openScreenRecorder: ()          => ipcRenderer.send('srec-open-from-editor'),
});

