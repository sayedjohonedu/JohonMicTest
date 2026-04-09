const { app, BrowserWindow, ipcMain } = require('electron');
app.setActivationPolicy('accessory');
app.on('ready', () => {
  const win = new BrowserWindow({
    width: 400, height: 100,
    type: 'panel', focusable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.loadURL('data:text/html,' + encodeURIComponent(`
    <button id="btn">Click me</button>
    <script>
      const btn = document.getElementById('btn');
      btn.addEventListener('mousedown', e => { e.preventDefault(); console.log('mousedown prevented'); window.require('electron').ipcRenderer.send('log', 'mousedown'); });
      btn.addEventListener('click', e => { console.log('clicked!'); window.require('electron').ipcRenderer.send('log', 'click'); });
    </script>
  `));
  ipcMain.on('log', (e, msg) => { console.log("EVENT:", msg); if(msg === 'click') app.quit(); });
});
