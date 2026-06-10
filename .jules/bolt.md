## 2024-06-10 - [Gate clipboard.readImage with availableFormats]
**Learning:** `clipboard.readImage()` in Electron is computationally expensive as it decodes the native image. Checking `clipboard.availableFormats()` beforehand is a much cheaper way to ensure image formats exist before extracting the image.
**Action:** Always check `clipboard.availableFormats()` first before calling `clipboard.readImage()`, especially in loops or startup initialization.
