## 2024-05-23 - App-specific UX Pattern: Missing ARIA labels on icon-only modal close buttons
**Learning:** Found an accessibility issue pattern specific to this app's components. Icon-only close buttons (e.g., those using `&times;` or inline SVGs) in custom popups and modals (often identifiable by classes like `modal-close-btn` or `btn-close`) frequently lack accessibility attributes.
**Action:** Always ensure these elements include `aria-label="Close"` and `title="Close"` to improve usability and screen reader support.
