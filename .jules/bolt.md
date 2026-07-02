## 2024-07-02 - Optimize clipboard image polling

**Learning:** `clipboard.readImage()` is computationally expensive because it decodes the image. In polling loops, checking `clipboard.availableFormats()` is insufficient if the image remains on the clipboard, causing redundant decodings.
**Action:** Use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes, avoiding continuous `readImage()` polling.
