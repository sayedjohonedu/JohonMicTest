## 2026-06-24 - Clipboard Image Read Performance Optimization
**Learning:** In Electron polling loops, checking `clipboard.availableFormats()` to detect new images is insufficient because it causes redundant decodings if an image remains on the clipboard. Calling `clipboard.readImage()` is extremely expensive.
**Action:** Use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes, avoiding continuous `readImage()` polling.
