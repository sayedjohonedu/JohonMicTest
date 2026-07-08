## 2024-10-24 - [Command Injection in ZIP Extraction]
**Vulnerability:** Found a command injection vulnerability in `src/main/appstore-manager.js` where `execSync` was used with string interpolation to extract a ZIP file (`execSync(\`unzip -o "${srcPath}" -d "${appDir}"\`)`).
**Learning:** `exec` and `execSync` are inherently unsafe when handling variable file paths or external inputs, even when seemingly quoted, because they spawn a shell.
**Prevention:** Always avoid `exec` and `execSync` with string interpolation for file paths/inputs. Use `execFileSync`, `spawnSync`, `execFile`, or `spawn` instead, passing arguments as an array so they are not interpreted by a shell.
