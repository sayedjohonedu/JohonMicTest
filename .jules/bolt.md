## 2026-06-11 - [Optimize initial clipboard read on startup]
**Learning:** `clipboard.readImage()` is computationally expensive in Electron because it decodes the full image. It shouldn't be used unconditionally even once during setup.
**Action:** Always gate its usage by checking `clipboard.availableFormats()` first to ensure image formats exist before extracting the NativeImage, even for initial state snapshots like in `clipboard-monitor.js` `start()`.
