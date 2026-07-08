## 2024-05-15 - Missing ARIA labels on modal close buttons
**Learning:** App-specific custom modal close buttons (e.g. `.modal-close-btn` with `&times;`) frequently lack accessibility attributes. This pattern appears multiple times across different modals in this app.
**Action:** When working on new modals or updating existing ones in this design system, always ensure icon-only close buttons include `aria-label="Close"` and `title="Close"`.
