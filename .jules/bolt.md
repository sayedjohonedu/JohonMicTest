## 2025-02-28 - Avoid unconditional clipboard.readImage()
**Learning:** `clipboard.readImage()` is computationally expensive in Electron. Calling it indiscriminately, especially on interval loops or at initialization, can cause measurable performance degradation because it extracts the full `NativeImage` even if there is no image in the clipboard.
**Action:** Always gate its usage by checking `clipboard.availableFormats()` first. Use `.some(f => f.startsWith('image/'))` to ensure image formats exist before making the expensive `clipboard.readImage()` call.
