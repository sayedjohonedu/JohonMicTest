## 2024-05-24 - Missing Accessibility on Modals
**Learning:** Icon-only close buttons (e.g., `&times;` or SVG) in the app's custom popups and modals (frequently identifiable by classes like `modal-close-btn` or `btn-close`) often lack accessibility attributes like `aria-label` and `title`.
**Action:** Always ensure these icon-only buttons include `aria-label="Close"` and `title="Close"` to support screen readers and tooltips.
