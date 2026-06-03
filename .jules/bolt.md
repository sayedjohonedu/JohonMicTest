## 2026-06-03 - DOM Rerenders in Electron renderer process
**Learning:** In Electron renderer processes dealing with high volume of media items (like Gallery) or complex CSS lists (like Font Picker), synchronous filtering on every keystroke blocks the main thread noticeably more than typical web apps.
**Action:** Always debounce search inputs tied to complex DOM lists in Electron renderers by at least 250ms.
