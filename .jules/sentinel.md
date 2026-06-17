## 2024-06-17 - [Secure URL and Window Creation]
**Vulnerability:** Electron app vulnerable to arbitrary window creation and protocol exploits via `shell.openExternal`.
**Learning:** `shell.openExternal` was used without validating URL protocols, potentially allowing execution of system commands (e.g., `file://`, `smb://`). Additionally, arbitrary window creation was allowed because `setWindowOpenHandler` was not explicitly configured to default-deny.
**Prevention:** Always validate URLs against an allowlist of safe protocols (`http:`, `https:`, `mailto:`) before calling `shell.openExternal`. Always set `setWindowOpenHandler` to return `{ action: 'deny' }` on `web-contents-created` to prevent malicious scripts from opening unauthorized windows.
