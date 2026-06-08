## 2024-05-18 - Missing Focus States on Custom Controls
**Learning:** Custom UI controls (like `.btn-action` and custom toggles) across MicTab lack visual focus indicators when navigating via keyboard, making the app difficult to use without a mouse.
**Action:** Always include a `:focus-visible` rule in global stylesheets (`settings.css`, `overlay.css`) to ensure a prominent focus ring (e.g., using `var(--accent)`) appears for keyboard users on all interactive elements.
