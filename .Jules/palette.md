## 2024-06-19 - Add ARIA Labels to modal close buttons
**Learning:** Many custom popups and modals in the app use visually-hidden-by-default or icon-only close buttons (`&times;` or SVG) without `aria-label` or `title` attributes, severely limiting screen reader accessibility for dismissing UI elements.
**Action:** Always add `aria-label="Close"` and `title="Close"` to any icon-only or purely symbolic close buttons (like elements with class `modal-close-btn` or `btn-close`).
