const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('junoAPI', {
  onSessionStart:    (cb) => ipcRenderer.on('session-start',    (_, data) => cb(data)),
  onTranscript:      (cb) => ipcRenderer.on('transcript',       (_, data) => cb(data)),
  onInterim:         (cb) => ipcRenderer.on('interim-text',     (_, text) => cb(text)),
  onStatus:          (cb) => ipcRenderer.on('overlay-status',   (_, s)    => cb(s)),
  onLanguage:        (cb) => ipcRenderer.on('language-changed', (_, lang) => cb(lang)),
  injectPunct:       (char) => ipcRenderer.send('inject-punct',     char),
  injectEnter:       ()     => ipcRenderer.send('inject-enter'),       // ↵ Return key
  injectBackspace:   ()     => ipcRenderer.send('inject-backspace'),   // ⌫ Delete last char
  injectSelectAll:   ()     => ipcRenderer.send('inject-select-all'),  // ⌘A / Ctrl+A
  injectCopy:        ()     => ipcRenderer.send('inject-copy'),        // ⌘C / Ctrl+C
  injectCut:         ()     => ipcRenderer.send('inject-cut'),         // ⌘X / Ctrl+X
  injectPaste:       ()     => ipcRenderer.send('inject-paste'),       // ⌘V / Ctrl+V
  injectUndo:        ()     => ipcRenderer.send('inject-undo'),        // ⌘Z / Ctrl+Z
  changeLanguage:    (lang) => ipcRenderer.send('overlay-change-language', lang),
  stopListening:     ()     => ipcRenderer.send('overlay-stop'),
  onPlaySound:       (cb) => ipcRenderer.on('play-sound',       ()        => cb()),
  getConfig:         ()     => ipcRenderer.invoke('get-config'),
  openUrl:           (url)  => ipcRenderer.send('open-url', url),
});
