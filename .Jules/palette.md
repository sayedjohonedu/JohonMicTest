## 2026-06-27 - Custom Popup Close Button Accessibility Pattern
**Learning:** In this application's custom popups and modals (identifiable by classes like `modal-close-btn` or `close-btn` and IDs like `btn-close`), the icon-only close buttons (often using `&times;` or SVG) frequently lack accessibility attributes.
**Action:** When adding or updating custom popups/modals, always ensure icon-only close buttons include `aria-label="Close"` and `title="Close"` to provide appropriate context for screen readers and helpful tooltips for sighted users.
