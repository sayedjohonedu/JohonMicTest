## 2025-02-28 - [Performance] Gate clipboard.readImage() Calls
**Learning:** `clipboard.readImage()` in Electron is a computationally expensive operation because it decodes the image data. Calling it unconditionally (e.g., during startup or routine checks) when no image is present causes unnecessary performance overhead.
**Action:** Always check `clipboard.availableFormats()` first. If the returned formats indicate the presence of an image (`formats.some(f => f.startsWith('image/'))`), then it is safe and efficient to call `clipboard.readImage()`.
