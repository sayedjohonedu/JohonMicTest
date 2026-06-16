## 2024-06-16 - Add ARIA Labels to Icon-only Buttons
**Learning:** Many icon-only buttons in the application use `title` for tooltip behavior but omit `aria-label` for screen readers. This is an accessibility issue pattern specific to this app's UI components.
**Action:** When adding or updating icon-only buttons, ensure that an `aria-label` attribute is provided, often matching the `title` attribute, to ensure keyboard and screen reader accessibility.
