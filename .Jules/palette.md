## 2024-06-03 - Added ARIA labels to buttons lacking them

**Learning:** Buttons used in this project often use icons from SVG without text. Because of this, accessibility can suffer because there is no clear text content for screen readers to pick up on. Some buttons had a `title` attribute but no `aria-label`.
**Action:** Implemented a mass replacement script to take the `title` attribute and duplicate it as an `aria-label` attribute on `<button>` elements. This will ensure that screen readers can communicate the purpose of the buttons to the user.
