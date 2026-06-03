const { app, dialog } = require('electron');
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("Did not get lock, showing dialog synchronously BEFORE ready...");
  try {
    dialog.showMessageBoxSync({ message: "Second instance dialog!" });
    console.log("Dialog closed.");
  } catch(e) {
    console.error("Error showing dialog:", e);
  }
  app.quit();
} else {
  console.log("Got lock!");
  app.whenReady().then(() => {
    console.log("App ready in primary instance!");
  });
}
