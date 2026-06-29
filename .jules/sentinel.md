## 2024-05-18 - [Electron Security Standards: Missing nodeIntegration and contextIsolation in Windows]
**Vulnerability:** The settingsWindow and voiceAgentsWindow in window-manager.js were missing explicit `nodeIntegration: false` and `contextIsolation: true` in their webPreferences configurations.
**Learning:** Even if `preload` scripts are used, explicitly setting these flags is a critical defense-in-depth measure to ensure the application remains secure against untrusted web content attempting to access native Node APIs (e.g. via XSS).
**Prevention:** Always ensure `nodeIntegration: false` and `contextIsolation: true` are present in every new BrowserWindow creation within the Electron main process.
