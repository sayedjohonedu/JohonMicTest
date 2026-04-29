'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// ── Minimal preload for sandboxed mini-apps ────────────────
// No Node.js, no filesystem access. Only exposes safe web APIs.
contextBridge.exposeInMainWorld('mictabApi', {
  // Placeholder for future safe bridges (e.g. translate, clipboard text)
  version: '1.0.0',
  platform: process.platform,
});

window.addEventListener('DOMContentLoaded', () => {
  // Let the layout settle then measure
  setTimeout(() => {
    let w = document.documentElement.scrollWidth;
    let h = document.documentElement.scrollHeight;
    
    // Some basic sanity limits for minimum size
    if (w < 300) w = 300;
    if (h < 300) h = 300;

    // Define maximum allowed window dimensions
    const MAX_W = 1000;
    const MAX_H = 800;

    let scale = 1;
    if (w > MAX_W || h > MAX_H) {
      scale = Math.min(MAX_W / w, MAX_H / h);
      webFrame.setZoomFactor(scale);
      
      // Re-read dimensions after zoom (or just calculate mathematically)
      w = Math.ceil(w * scale);
      h = Math.ceil(h * scale);
    }
    
    ipcRenderer.send('miniapp-resize', { width: w, height: h });
  }, 250);
});
