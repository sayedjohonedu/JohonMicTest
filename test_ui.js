const { app, BrowserWindow } = require('electron');
const path = require('path');
require('./main.js');

app.whenReady().then(() => {
  setTimeout(() => {
    const wins = BrowserWindow.getAllWindows();
    const overlay = wins.find(w => w.webContents.getURL().includes('overlay.html'));
    if (overlay) {
      console.log('Found overlay, executing click...');
      overlay.webContents.executeJavaScript(`
        document.querySelector('.punct-btn').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        console.log('Dispatched mousedown on punct-btn');
      `).catch(err => console.error('JS eval error:', err));
    } else {
      console.log('Overlay not found');
    }
  }, 2000);
  
  setTimeout(() => {
    app.exit(0);
  }, 4000);
});
