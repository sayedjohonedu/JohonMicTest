## 2024-10-24 - Command Injection in unzip execution
**Vulnerability:** Found `execSync("unzip -o '" + srcPath + "' -d '" + appDir + "'")` (via template literals) which is vulnerable to command injection if paths contain shell characters.
**Learning:** This codebase processes dynamic paths and external inputs. Using `exec` or `execSync` with string interpolation for file operations is inherently insecure and can lead to arbitrary code execution.
**Prevention:** Always use `execFileSync` (or `spawnSync`, `execFile`, `spawn`) and pass arguments as an array (`execFileSync("unzip", ["-o", srcPath, "-d", appDir])`) rather than concatenating strings to ensure safe execution without a shell.
