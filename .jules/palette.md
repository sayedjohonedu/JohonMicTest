## 2024-06-21 - Icon-Only Close Buttons Need ARIA Labels
**Learning:** Found an app-specific pattern where icon-only close buttons (like `.modal-close-btn` with `&times;` and `.close-btn` with SVGs) across multiple custom popups and modals lacked accessibility attributes.
**Action:** Add `aria-label="Close"` and `title="Close"` to all icon-only close buttons encountered in `.html` files, ensuring screen readers announce them properly.
