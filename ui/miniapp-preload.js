'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// ── Minimal preload for sandboxed mini-apps ────────────────
// No Node.js, no filesystem access. Only exposes safe web APIs.
contextBridge.exposeInMainWorld('mictabApi', {
  version: '1.0.0',
  platform: process.platform,
});

// ── Shell bridge (title-bar controls) ─────────────────────
// Exposed to the shell HTML (miniapp-shell.html) so the
// Reload / Close buttons can reach the main process.
contextBridge.exposeInMainWorld('miniappShellAPI', {
  close: () => ipcRenderer.send('miniapp-shell-close'),
});

// ── Auto-size on load (for apps without a saved size) ─────
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    let w = document.documentElement.scrollWidth;
    let h = document.documentElement.scrollHeight;

    if (w < 300) w = 300;
    if (h < 300) h = 300;

    const MAX_W = 1000;
    const MAX_H = 800;

    let scale = 1;
    if (w > MAX_W || h > MAX_H) {
      scale = Math.min(MAX_W / w, MAX_H / h);
      webFrame.setZoomFactor(scale);
      w = Math.ceil(w * scale);
      h = Math.ceil(h * scale);
    }

    ipcRenderer.send('miniapp-resize', { width: w, height: h });
  }, 250);
});
