## 2024-07-02 - Added accessibility attributes to wordlimit popup close button
**Learning:** Custom modal dialogs with icon-only close buttons in this app often omit `aria-label` and `title` attributes.
**Action:** Always verify icon-only buttons (`btn-close`, SVG-only) have both `aria-label` and `title` attributes for screen readers and tooltips.
