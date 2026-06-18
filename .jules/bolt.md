## 2024-05-18 - Electron clipboard.readImage() optimization
**Learning:** `clipboard.readImage()` is a computationally expensive operation in Electron, as it synchronously decodes the full image.
**Action:** Always check `clipboard.availableFormats()` first. This is a very cheap check that allows us to confirm if an image actually exists before we perform the expensive `readImage()` operation.