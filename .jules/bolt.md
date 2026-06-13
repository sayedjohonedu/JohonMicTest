## 2025-02-18 - [Gate `clipboard.readImage()` behind `clipboard.availableFormats()`]
**Learning:** `clipboard.readImage()` is computationally expensive in Electron because it natively decodes the full image. Calling it unconditionally on startup (or in a polling loop) when there is no image in the clipboard is a performance anti-pattern.
**Action:** Always check `clipboard.availableFormats()` first. If `formats.some(f => f.startsWith('image/'))` is false, bypass the expensive `clipboard.readImage()` call.
