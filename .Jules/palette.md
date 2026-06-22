## 2024-05-24 - App-specific UX Pattern: Accessibility for Icon-only Close Buttons
**Learning:** Icon-only close buttons (e.g., `&times;` or SVG) in the app's custom popups and modals (often identifiable by classes like `modal-close-btn` or `btn-close`) frequently lack accessibility attributes.
**Action:** Always ensure these elements include `aria-label="Close"` and `title="Close"` when adding or modifying modals and popups to ensure full accessibility for screen readers.
