## 2024-06-15 - [Optimize clipboard initial snapshot]
**Learning:** `clipboard.readImage()` is computationally expensive in Electron because it extracts and decodes the NativeImage. This can block the main thread and impact application startup time.
**Action:** Always gate `clipboard.readImage()` usages by checking `clipboard.availableFormats()` first to ensure image formats exist before attempting to extract the NativeImage.
