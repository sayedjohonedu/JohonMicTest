## 2026-06-09 - [Clipboard Keyboard A11y & ARIA Labels]
**Learning:** Dynamically generated icon-only action buttons and entry cards frequently lack ARIA labels and focus states, leading to poor keyboard navigation.
**Action:** Applied automated attribute copying for ARIA labels on dynamic elements, and ensured focus states (`:focus-visible`, `:focus-within`) are implemented alongside hover states for elements that users can tab into.
