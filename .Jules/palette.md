## 2026-06-17 - Added missing ARIA labels to dynamically loaded icon buttons
**Learning:** In dynamically loaded panels or windows like the screen recorder, native icon buttons must explicitly define `aria-label` because screen readers cannot interpret the visual SVG intent or the floating tooltip (`title`) reliably.
**Action:** Ensure that any future icon-only buttons added to specialized windows or overlays contain descriptive `aria-label` tags mirroring their `title` values.
