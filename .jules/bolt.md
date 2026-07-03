## 2024-07-03 - [Electron Clipboard Image Polling]
**Learning:** Checking `clipboard.availableFormats()` isn't enough for image detection in a polling loop, because it causes redundant, computationally expensive `clipboard.readImage()` decodings if the user simply leaves an image on the clipboard.
**Action:** Instead of `readImage()`, use `clipboard.readBuffer(format)` to read raw image bytes and hash them (e.g., via native `crypto` SHA-256) to detect changes, only calling `readImage()` when the hash has genuinely changed.
