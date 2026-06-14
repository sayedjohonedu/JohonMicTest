
## 2024-05-18 - [Missing ARIA labels on screen recorder controls]
**Learning:** Found a common pattern of missing `aria-label`s on icon-only control buttons within overlay and screen-recorder interfaces, negatively impacting screen reader usability despite having visual tooltips (`title` attribute).
**Action:** Ensure all icon-only control buttons, even those with `title` attributes, receive an explicit `aria-label` for proper screen reader accessibility across all UI components.
