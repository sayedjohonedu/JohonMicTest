## 2024-03-24 - Prevent expensive clipboard image extraction on startup
**Learning:** In Electron, `clipboard.readImage()` is computationally expensive because it decodes the full image. It was being called unconditionally during startup to initialize the `_lastImgSize` snapshot, which needlessly blocked the main thread when no image was in the clipboard.
**Action:** Always gate `clipboard.readImage()` usages by checking `clipboard.availableFormats()` first, ensuring image formats actually exist before performing the extraction.
