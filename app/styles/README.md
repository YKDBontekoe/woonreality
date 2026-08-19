# Styling ownership

- `foundation.css` — tokens, reset, typography, and global element defaults.
- `design-system.css` — reusable card, button, field, spacing, and responsive primitives.
- `marketing.css` — the public landing page and navigation.
- `property.css` — the property report, map, signals, AI brief, and comparison views.
- `purchase.css` — purchase cockpit and case workflow.
- `finance.css` — mortgage, affordability, onboarding, and account screens.
- `account.css` — authentication and case-page scaffolding.
- `components.css` — shared UI helpers and listing/running-cost components.

Keep page-specific selectors in the owning file. Add shared visual rules to
`design-system.css` and prefer `ui-*` primitives for new UI.
