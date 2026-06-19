
## 2024-05-24 - Arbitrary window creation and openExternal protocol vulnerabilities
**Vulnerability:** Electron apps can spawn arbitrary windows or execute local files if `shell.openExternal` and window creation are not explicitly secured.
**Learning:** By default, Electron allows web contents to create new windows and `shell.openExternal` accepts any protocol (e.g. `file://`, which can be abused).
**Prevention:** Always restrict URL protocols before calling `shell.openExternal` and explicitly deny arbitrary window creation by implementing `setWindowOpenHandler` on `web-contents-created`.
