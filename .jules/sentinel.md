## 2024-06-08 - [Unrestricted External URL Opening via IPC]
**Vulnerability:** IPC handlers like `open-url` and `bridge-error-open-url` receive URLs directly from the renderer process and pass them directly to `shell.openExternal(url)` without any validation.
**Learning:** This exposes the application to arbitrary protocol execution (like `file://` or custom schemas) which can lead to command execution or local file access if the renderer is compromised or tricked.
**Prevention:** Always validate the URL protocol (e.g., ensuring it starts with `http://`, `https://`, or `mailto://`) before calling `shell.openExternal`.
