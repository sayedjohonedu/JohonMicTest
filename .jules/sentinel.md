## 2024-05-18 - [Fix arbitrary shell.openExternal and window creation vulnerabilities]
**Vulnerability:** Arbitrary URL opening via `shell.openExternal` and missing window creation restrictions in `web-contents-created`.
**Learning:** In Electron, passing unvalidated IPC parameters to `shell.openExternal` can allow remote code execution or arbitrary file opening. Also, omitting `setWindowOpenHandler` allows rendering content to open potentially malicious new windows.
**Prevention:** Always validate protocols (e.g. `http:`, `https:`, `mailto:`) before calling `shell.openExternal`. Deny arbitrary window creation by default using `contents.setWindowOpenHandler(() => ({ action: "deny" }));`.
