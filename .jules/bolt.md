## 2026-06-22 - Optimize Clipboard Image Polling in Electron
**Learning:** `clipboard.readImage()` in Electron is computationally expensive as it decodes the image every time. Checking `clipboard.availableFormats()` in a polling loop is insufficient because it causes redundant decodings if an image remains on the clipboard.
**Action:** Use `clipboard.readBuffer(format)` to get raw image bytes, then hash them (e.g., using `crypto.createHash('sha256')`) and compare the hash. Only call `clipboard.readImage()` when a new image hash is detected.
