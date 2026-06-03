const { app, dialog, BrowserWindow } = require('electron');
app.setName('MyAppName1234');
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("Did not get lock!");
  app.whenReady().then(() => {
    console.log("Second instance ready! Showing dialog...");
    dialog.showMessageBoxSync({ message: "Second instance dialog!" });
    app.quit();
  });
} else {
  console.log("Got lock!");
  app.whenReady().then(() => {
    console.log("First instance ready!");
    new BrowserWindow({show: false}); // Keep it alive
  });
}
