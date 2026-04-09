const { app, BrowserWindow } = require('electron');
app.setActivationPolicy('accessory');
app.on('ready', () => {
  const win = new BrowserWindow({
    width: 400, height: 100,
    type: 'panel',
    focusable: false,
    alwaysOnTop: true,
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile('package.json');
});
