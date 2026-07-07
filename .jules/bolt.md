## 2025-06-30 - Optimize Electron Clipboard Image Polling
**Learning:** `clipboard.readImage()` is computationally expensive in Electron because it decodes the image every time. In a polling loop, checking `clipboard.availableFormats()` is not enough if an image remains on the clipboard, because it will trigger redundant decoding.
**Action:** Use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes before calling `readImage()`.
