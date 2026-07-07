## 2024-06-23 - Appstore Modal Close Buttons Lack ARIA Labels
**Learning:** Found an accessibility issue pattern specific to this app's components where icon-only close buttons in modals (class `modal-close-btn` representing `&times;`) lack ARIA labels and title attributes, making them inaccessible to screen readers.
**Action:** Always add `aria-label="Close"` and `title="Close"` to any icon-only button used for closing modals or other UI elements across the application to ensure keyboard accessibility and proper screen reader announcements.
