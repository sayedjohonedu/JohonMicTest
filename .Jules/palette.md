## 2024-06-29 - Missing accessibility attributes in custom modal close buttons
**Learning:** In this app's codebase, custom popups and modals (often identifiable by classes like `modal-close-btn` or `btn-close`) frequently lack accessibility attributes. Icon-only close buttons (e.g., `&times;` or SVG) in these components are missing `aria-label="Close"` and `title="Close"`.
**Action:** Always verify and ensure that these elements include `aria-label="Close"` and `title="Close"` when adding or modifying custom modals/popups to maintain keyboard and screen reader accessibility.
