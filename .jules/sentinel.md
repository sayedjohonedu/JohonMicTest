## 2026-07-04 - [Fix Command Injection in Zip Fallback]
**Vulnerability:** The `appstore-manager.js` zip extraction fallback used `execSync` with string interpolation for `unzip`, making it vulnerable to command injection if a maliciously named zip file path was provided.
**Learning:** Always use `execFileSync` or `spawnSync` with an array of arguments instead of shell execution with string interpolation when handling file paths or user input in child processes.
**Prevention:** Avoid `execSync` and `exec` when dealing with external inputs. Use `execFileSync`, `spawnSync`, `execFile`, or `spawn` and pass arguments as an array to prevent shell interpretation.
