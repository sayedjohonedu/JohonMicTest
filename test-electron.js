const { app, clipboard } = require('electron');
app.whenReady().then(() => {
  console.log("Clipboard keys:", Object.keys(clipboard));
  app.quit();
});
