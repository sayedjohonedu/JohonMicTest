## 2026-06-27 - [Missing Electron Security Defaults]
**Vulnerability:** Settings and Voice Agents windows lacked explicit `nodeIntegration: false` and `contextIsolation: true` declarations.
**Learning:** Depending on defaults can expose windows to RCE if an attacker compromises the renderer.
**Prevention:** Always explicitly define these security properties for every new BrowserWindow.
