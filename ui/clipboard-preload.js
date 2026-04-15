/**
 * clipboard-preload.js
 * ──────────────────────────────────────────────────────────────────────────
 * Exposes a safe `clipboardAPI` bridge to the Clipboard Manager renderer.
 * All communication goes through contextBridge / ipcRenderer.
 * ──────────────────────────────────────────────────────────────────────────
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardAPI', {

  // ── Query & display ──────────────────────────────────────────────────────
  getHistory:     (opts)        => ipcRenderer.invoke('cb-get-history', opts),
  getStats:       ()            => ipcRenderer.invoke('cb-get-stats'),
  getEntryDates:  ()            => ipcRenderer.invoke('cb-get-entry-dates'),
  getUserCats:    ()            => ipcRenderer.invoke('cb-get-user-cats'),

  // ── Actions ──────────────────────────────────────────────────────────────
  deleteEntry:      (id, context)   => ipcRenderer.invoke('cb-delete-entry', id, context),
  deleteAll:        ()              => ipcRenderer.invoke('cb-delete-all'),
  deleteDay:        (dateMs)        => ipcRenderer.invoke('cb-delete-day', dateMs),
  deleteOldestDay:  ()              => ipcRenderer.invoke('cb-delete-oldest-day'),
  toggleFavorite:   (id)            => ipcRenderer.invoke('cb-toggle-favorite', id),
  togglePin:        (id)            => ipcRenderer.invoke('cb-toggle-pin', id),
  editEntry:        (id, text)      => ipcRenderer.invoke('cb-edit-entry', id, text),
  setUserCats:      (id, cats)      => ipcRenderer.invoke('cb-set-user-cats', id, cats),
  assignCategory:   (id, cat)       => ipcRenderer.invoke('cb-assign-category', id, cat),
  deleteUserCat:    (catName)       => ipcRenderer.invoke('cb-delete-user-cat', catName),
  saveUserCatsMeta: (cats)          => ipcRenderer.invoke('cb-save-user-cats-meta', cats),
  pasteEntry:       (id)            => ipcRenderer.invoke('cb-paste-entry', id),
  copyToClipboard:  (id)            => ipcRenderer.invoke('cb-copy-to-clipboard', id),
  bumpToTop:        (id)            => ipcRenderer.invoke('cb-bump-to-top', id),
  showInFolder:     (id)            => ipcRenderer.invoke('cb-show-in-folder', id),

  // ── Import / Export ───────────────────────────────────────────────────────
  exportHistory:    ()              => ipcRenderer.invoke('cb-export-history'),
  importHistory:    ()              => ipcRenderer.invoke('cb-import-history'),
  importCommit:     (payload)       => ipcRenderer.invoke('cb-import-commit', payload),

  // ── Image folder ─────────────────────────────────────────────────────────
  openImagesFolder: ()              => ipcRenderer.invoke('cb-open-images-folder'),

  // ── Settings ──────────────────────────────────────────────────────────────
  getConfig:           ()    => ipcRenderer.invoke('cb-get-config'),
  saveConfig:          (cfg) => ipcRenderer.invoke('cb-save-config', cfg),
  setClipboardConfig:  (cb)  => ipcRenderer.invoke('cb-set-clipboard-config', cb),
  confirmAutoDelete:   ()    => ipcRenderer.invoke('cb-confirm-auto-delete'),
  resumeHotkeys:       ()    => ipcRenderer.send('resume-hotkeys'),

  // ── Licensing ────────────────────────────────────────────────────────────
  getLicenseStatus: ()              => ipcRenderer.invoke('cb-get-license-status'),

  // ── Real-time push from main process ────────────────────────────────────
  onNewEntry:       (fn)            => ipcRenderer.on('cb-new-entry', (_, data) => fn(data)),
  onExpiredPrompt:  (fn)            => ipcRenderer.on('cb-expired-prompt', (_, data) => fn(data)),
  onWindowShown:    (fn)            => ipcRenderer.on('cb-window-shown', () => fn()),
  onConfigUpdate:   (fn)            => ipcRenderer.on('config-updated', (_, data) => fn(data)),

  // ── Utility ──────────────────────────────────────────────────────────────
  openUrl:          (url) => ipcRenderer.send('open-url', url),
  closeWindow:      ()    => ipcRenderer.send('cb-close-window'),
  minimizeWindow:   ()    => ipcRenderer.send('cb-minimize-window'),
  hideWindow:       ()    => ipcRenderer.send('cb-hide-window'),
});
