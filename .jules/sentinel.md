## 2024-06-12 - [Unsafe URL Execution & Arbitrary Window Creation]
**Vulnerability:** Unrestricted `shell.openExternal` calls allowing potentially dangerous protocols (e.g., `file://`, `smb://`) and missing `setWindowOpenHandler` allowing arbitrary window creation in Electron WebContents.
**Learning:** External links should always validate the protocol before passing to `shell.openExternal` to prevent RCE or local file access. Similarly, Electron defaults allow rendering context to open new windows unless explicitly denied via `setWindowOpenHandler`.
**Prevention:** Always validate protocols (`http:`, `https:`, `mailto:`) before calling `shell.openExternal`. Always implement `contents.setWindowOpenHandler(() => ({ action: 'deny' }))` inside `app.on('web-contents-created')`.
