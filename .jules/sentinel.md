
## 2025-05-18 - [Command Injection via File Paths]
**Vulnerability:** Command injection vulnerability in `src/main/appstore-manager.js` when running `unzip` shell command via `execSync` with string interpolation of file paths.
**Learning:** Never use `exec` or `execSync` with string interpolation for external inputs or file paths, as they can contain shell metacharacters resulting in command injection.
**Prevention:** Use `execFileSync`, `spawnSync`, `execFile`, or `spawn` and pass arguments as an array instead.
