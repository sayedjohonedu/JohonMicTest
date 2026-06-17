## 2024-05-24 - Optimize clipboard startup by gating readImage
**Learning:** `clipboard.readImage()` is computationally expensive in Electron as it decodes the full image. Calling it without checking if an image is actually in the clipboard wastes resources.
**Action:** Always check `clipboard.availableFormats()` first to ensure an image is present before invoking `clipboard.readImage()`. `availableFormats()` is lightweight and fast.
