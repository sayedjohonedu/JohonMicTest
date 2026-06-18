## 2025-02-14 - Fix shell.openExternal RCE and Window Hijacking
**Vulnerability:** Arbitrary window creation was not intercepted and `shell.openExternal` was called with unsafe URL protocols (e.g., file://).
**Learning:** In Electron apps, `shell.openExternal` without validation allows Remote Code Execution (RCE) via custom protocols, while missing `setWindowOpenHandler` lets compromised renderers spawn arbitrary popups and bypass process isolation.
**Prevention:** Always implement `setWindowOpenHandler` with `{ action: 'deny' }` on `web-contents-created`, and validate protocols (only `http:`, `https:`, `mailto:`) before calling `shell.openExternal`.
