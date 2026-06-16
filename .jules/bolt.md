## 2024-05-19 - Optimize clipboard image reading on startup
**Learning:** `clipboard.readImage()` is a computationally expensive operation because it requires extracting a NativeImage from the OS clipboard. Calling it blindly on application startup or within an interval loop when there is no image format available unnecessarily blocks the main thread.
**Action:** Always gate usage of `clipboard.readImage()` by checking `clipboard.availableFormats()` first to ensure an image format is present before triggering the native read process.
