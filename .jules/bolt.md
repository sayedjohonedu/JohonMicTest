## 2025-10-18 - Optimize clipboard image polling
**Learning:** Checking `clipboard.availableFormats()` in polling loops is insufficient because it causes redundant and computationally expensive image decoding via `clipboard.readImage()` if an image remains on the clipboard.
**Action:** Use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes, entirely avoiding continuous `readImage()` polling when the image hasn't changed.
