## 2024-05-24 - [CRITICAL] Arbitrary URL and window creation risks
**Vulnerability:** The application was passing URLs directly from IPC messages to `shell.openExternal` without validation and did not restrict arbitrary window creation.
**Learning:** This is a common Electron security risk. If an attacker controls the URL being opened, they could execute arbitrary local binaries or scripts (e.g., using `file://` or custom URI schemes). Allowing arbitrary window creation increases the attack surface for Cross-Site Scripting (XSS) payloads.
**Prevention:** Always validate the URL protocol (e.g., allow only `http:`, `https:`, and `mailto:`) before calling `shell.openExternal`. Use `setWindowOpenHandler` on `web-contents-created` to deny arbitrary window creation.
