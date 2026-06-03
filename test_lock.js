const { app, dialog } = require('electron');
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("Did not get lock, waiting for ready...");
  app.whenReady().then(() => {
    console.log("App ready in second instance! Showing dialog...");
    app.quit();
  });
} else {
  console.log("Got lock!");
  app.whenReady().then(() => {
    console.log("App ready in primary instance!");
  });
}
