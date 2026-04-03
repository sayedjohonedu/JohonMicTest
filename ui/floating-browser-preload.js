const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  // Window
  close:    () => ipcRenderer.send('floating-browser-close'),
  minimize: () => ipcRenderer.send('floating-browser-minimize'),
  powerOff: () => ipcRenderer.send('floating-browser-power-off'),
  restoreSession: () => ipcRenderer.send('floating-browser-restore-session'),
  newSession: () => ipcRenderer.send('floating-browser-new-session'),

  // Navigation
  navigate:  (url) => ipcRenderer.send('floating-browser-navigate', url),
  goBack:    ()    => ipcRenderer.send('floating-browser-back'),
  goForward: ()    => ipcRenderer.send('floating-browser-forward'),
  reload:    ()    => ipcRenderer.send('floating-browser-reload'),

  // Tabs
  addTab:    (url, background = false) => ipcRenderer.send('floating-browser-add-tab', { url, background }),
  closeTab:  (id)  => ipcRenderer.send('floating-browser-close-tab', id),
  switchTab: (id)  => ipcRenderer.send('floating-browser-switch-tab', id),

  // Find in page
  findShow:  ()                        => ipcRenderer.send('floating-browser-find-show'),
  findHide:  ()                        => ipcRenderer.send('floating-browser-find-hide'),
  findQuery: (query, forward, next)    => ipcRenderer.send('floating-browser-find-query', { query, forward, findNext: next }),

  // Zoom
  zoom:      (delta) => ipcRenderer.send('floating-browser-zoom', delta),
  zoomReset: ()      => ipcRenderer.send('floating-browser-zoom-reset'),

  // DevTools
  devtools: () => ipcRenderer.send('floating-browser-devtools'),

  // Settings
  settingsToggle: (isOpen) => ipcRenderer.send('floating-browser-settings-toggle', isOpen),

  // Bookmarks
  bookmarksGet:    ()             => ipcRenderer.invoke('floating-browser-bookmarks-get'),
  bookmarkToggle:  (url, title)   => ipcRenderer.send('floating-browser-bookmark-toggle', { url, title }),

  // History
  historyGet:   () => ipcRenderer.invoke('floating-browser-history-get'),
  historyClear: () => ipcRenderer.send('floating-browser-history-clear'),

  // Downloads
  dlAction:     (id, action) => ipcRenderer.send('floating-browser-dl-action', { id, action }),

  // Passwords
  passwordsGet:   () => ipcRenderer.invoke('floating-browser-passwords-get'),
  passwordSave:   (pwd) => ipcRenderer.invoke('floating-browser-password-save', pwd),
  passwordDelete: (id) => ipcRenderer.invoke('floating-browser-password-delete', id),

  // Silence reset
  resetSilence: () => ipcRenderer.send('floating-browser-user-activity'),

  // ── Listeners ────────────────────────────────────────────────────────────
  on: (channel, cb) => {
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_, data) => cb(data));
  },
  onTabsInit:    (cb) => { ipcRenderer.removeAllListeners('browser-tabs-init');    ipcRenderer.on('browser-tabs-init',    (_, d) => cb(d)); },
  onTabAdded:    (cb) => { ipcRenderer.removeAllListeners('browser-tab-added');    ipcRenderer.on('browser-tab-added',    (_, d) => cb(d)); },
  onTabRemoved:  (cb) => { ipcRenderer.removeAllListeners('browser-tab-removed');  ipcRenderer.on('browser-tab-removed',  (_, d) => cb(d)); },
  onTabSwitched: (cb) => { ipcRenderer.removeAllListeners('browser-tab-switched'); ipcRenderer.on('browser-tab-switched', (_, d) => cb(d)); },
  onTabUpdated:  (cb) => { ipcRenderer.removeAllListeners('browser-tab-updated');  ipcRenderer.on('browser-tab-updated',  (_, d) => cb(d)); },
  onPoweredOff:  (cb) => { ipcRenderer.removeAllListeners('browser-powered-off');  ipcRenderer.on('browser-powered-off',  () => cb()); },
});
