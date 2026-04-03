const { ipcRenderer } = require('electron');

function notifyActivity() {
  ipcRenderer.send('floating-browser-user-activity');
}

// Listen for interactions in the capture phase so they're not blocked by webpage logic
window.addEventListener('mousedown', notifyActivity, true);
window.addEventListener('keydown', notifyActivity, true);
window.addEventListener('wheel', notifyActivity, true);
window.addEventListener('touchstart', notifyActivity, true);
