## 2026-07-01 - Avoid clipboard.readImage() in Polling Loops
**Learning:** In Electron, `clipboard.readImage()` is computationally expensive because it decodes the full image. In polling loops, simply checking `clipboard.availableFormats()` to gate it is insufficient; if an image remains on the clipboard, `readImage()` will decode it repetitively.
**Action:** Use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., using `crypto` SHA-256) to detect changes, only calling `readImage()` when the hash indicates a new image is present.
