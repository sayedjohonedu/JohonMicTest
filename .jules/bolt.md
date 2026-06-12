## YYYY-MM-DD - [Gate `clipboard.readImage()` on Startup]
**Learning:** `clipboard.readImage()` is an expensive operation in Electron even if the clipboard does not contain an image, because it may trigger system-level interactions. We already gated it in the poll loop, but missed gating it during initialization.
**Action:** Always use `clipboard.availableFormats().some(f => f.startsWith('image/'))` before calling `clipboard.readImage()` anywhere in the codebase.
