## 2024-07-03 - Missing Accessibility Attributes on Custom Modal Close Buttons
**Learning:** Custom UI modal and popup components in this app (often using classes like `.modal-close-btn` or `.btn-close` and containing `&times;` or SVG icons) consistently lack proper accessibility attributes like `aria-label` or `title`. This renders them opaque to screen readers and keyboard users relying on tooltips.
**Action:** When working on UI files (especially HTML templates for modals), proactively check for icon-only close buttons and ensure they have `aria-label="Close"` and `title="Close"`.
