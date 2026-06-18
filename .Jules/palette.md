## 2024-06-18 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Found a common pattern of using raw characters (e.g. `&times;`, `✕`) or SVGs inside `<button>` elements for closing modals, clearing searches, etc., without `aria-label` attributes, making them inaccessible to screen readers.
**Action:** Always verify that icon-only interactive elements in vanilla HTML structures include descriptive `aria-label` attributes to ensure keyboard and screen reader accessibility.
