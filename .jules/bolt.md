## 2024-06-07 - [Electron Clipboard Optimization]
**Learning:** `clipboard.readImage()` in Electron is a computationally expensive operation that decodes the entire image data from the clipboard, causing main thread lag.
**Action:** Always gate any call to `clipboard.readImage()` by first calling the very cheap `clipboard.availableFormats()` to check for the presence of image formats (`formats.some(f => f.startsWith('image/'))`). Avoid unconditional extraction on application startup or within polling loops.
