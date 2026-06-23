## 2025-01-20 - [Performance] Polling loop image checking optimization
**Learning:** `clipboard.readImage()` is computationally expensive. In polling loops, checking `clipboard.availableFormats()` is insufficient because it causes redundant decodings if an image remains on the clipboard.
**Action:** Instead, use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes, avoiding continuous `readImage()` polling.
