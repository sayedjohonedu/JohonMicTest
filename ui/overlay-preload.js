const { contextBridge, ipcRenderer } = require('electron');

// Helper: remove stale listener before re-registering to prevent duplicates.
function onChannel(channel, cb) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, cb);
}

contextBridge.exposeInMainWorld('junoAPI', {
  onSessionStart:    (cb) => onChannel('session-start',    (_, data) => cb(data)),
  onTranscript:      (cb) => onChannel('transcript',       (_, data) => cb(data)),
  onInterim:         (cb) => onChannel('interim-text',     (_, text) => cb(text)),
  onStatus:          (cb) => onChannel('overlay-status',   (_, s)    => cb(s)),
  onLanguage:        (cb) => onChannel('language-changed', (_, lang) => cb(lang)),
  onPlaySound:       (cb) => onChannel('play-sound',       ()        => cb()),
  injectPunct:       (char) => ipcRenderer.send('inject-punct',     char),
  injectEnter:       ()     => ipcRenderer.send('inject-enter'),
  injectBackspace:   ()     => ipcRenderer.send('inject-backspace'),
  injectSelectAll:   ()     => ipcRenderer.send('inject-select-all'),
  injectCopy:        ()     => ipcRenderer.send('inject-copy'),
  injectCut:         ()     => ipcRenderer.send('inject-cut'),
  injectPaste:       ()     => ipcRenderer.send('inject-paste'),
  injectUndo:        ()     => ipcRenderer.send('inject-undo'),
  changeLanguage:    (lang) => ipcRenderer.send('overlay-change-language', lang),
  stopListening:     ()     => ipcRenderer.send('overlay-stop'),
  toggleFavorite:    (lang) => ipcRenderer.send('toggle-favorite', lang),
  getConfig:         ()     => ipcRenderer.invoke('get-config'),
  openUrl:           (url)  => ipcRenderer.send('open-url', url),
});
