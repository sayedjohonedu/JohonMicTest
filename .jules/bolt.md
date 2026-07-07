## 2024-07-07 - [Optimize clipboard image polling]
**Learning:** Checking `clipboard.availableFormats()` in a polling loop isn't sufficient when an image format is present because calling `clipboard.readImage()` is computationally expensive and decodes the image. If the image isn't removed from the clipboard, continuous polling will repeatedly decode it.
**Action:** Instead, read raw bytes using `clipboard.readBuffer(format)` and hash them (e.g., via native `crypto` SHA-256). Only decode with `clipboard.readImage()` if the hash has changed.
