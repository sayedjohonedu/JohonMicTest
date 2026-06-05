## 2024-05-24 - [Gating Expensive Clipboard Operations]
**Learning:** `clipboard.readImage()` is computationally expensive in Electron because it decodes the full image. It should never be called unconditionally, such as on application startup or in polling loops, when we don't know if an image is actually in the clipboard.
**Action:** Always gate `clipboard.readImage()` usages by first checking `clipboard.availableFormats()` to see if an image format actually exists. `clipboard.availableFormats()` is a very cheap check.
