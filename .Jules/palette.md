## 2026-06-20 - Added accessibility to modal close buttons
**Learning:** Icon-only modal close buttons in custom popups often lack proper ARIA labels and titles, making them inaccessible to screen readers and lacking tooltips for users.
**Action:** Always ensure any `<button class="close-btn">&times;</button>` or similar icon-only buttons include `aria-label="Close"` and `title="Close"`.
