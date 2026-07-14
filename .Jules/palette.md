## 2024-07-08 - Missing ARIA Labels on Icon-only Close Buttons
**Learning:** Custom UI modal implementations across this app consistently use an unstyled button containing `&times;` or an SVG for the "Close" action (e.g., classes like `modal-close-btn` or `close-btn`), which are completely inaccessible to screen readers without accompanying descriptive attributes.
**Action:** When working on custom modals or popups within this design system, always explicitly add `aria-label="Close"` and `title="Close"` to these unstyled buttons to ensure keyboard and screen reader accessibility.
