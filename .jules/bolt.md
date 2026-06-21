## 2024-05-18 - Prevent redundant clipboard image decodings
**Learning:** Checking `clipboard.availableFormats()` in a loop is insufficient to prevent redundant decodings if an image remains on the clipboard. Calling `clipboard.readImage()` is computationally expensive because it decodes the image.
**Action:** Instead, use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes, avoiding continuous `readImage()` polling.
