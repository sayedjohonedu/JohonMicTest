## 2024-07-08 - [Avoid clipboard.readImage in polling loops]
**Learning:** In Electron, `clipboard.readImage()` is computationally expensive because it decodes the image. Checking `clipboard.availableFormats()` in a polling loop is insufficient because if an image remains on the clipboard, `readImage()` will be repeatedly called, causing unnecessary decoding.
**Action:** Use `clipboard.readBuffer(format)` to get the raw bytes and calculate a hash (e.g., SHA-256) to detect changes before performing expensive image decodings.
