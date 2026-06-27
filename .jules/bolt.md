## 2024-06-27 - Optimize Clipboard Image Polling
**Learning:** In Electron, `clipboard.readImage()` is computationally expensive because it decodes the image. In polling loops, checking `clipboard.availableFormats()` is insufficient since it will trigger redundant decodings if an image remains on the clipboard.
**Action:** Use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes, avoiding continuous `readImage()` polling for the same image.
