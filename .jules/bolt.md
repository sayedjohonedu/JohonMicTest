## 2024-06-08 - [Optimize Clipboard Monitor start()]
**Learning:** `clipboard.readImage()` is extremely computationally expensive in Electron. Even doing it once at startup unconditionally can block the main thread unnecessarily. This pattern existed in `start()` but was previously only optimized in the loop (`_checkImage()`).
**Action:** Always gate any `clipboard.readImage()` call by first doing a cheap check via `clipboard.availableFormats().some(f => f.startsWith('image/'))`.
