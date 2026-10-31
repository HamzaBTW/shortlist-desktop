# Design source

These files are copies from the Shortlist design system (Claude Design). The design system is the source of truth; update these copies when it changes.

- `tokens.json`: colours (Midnight and Light-relax themes), type, spacing, radius, shadows. `npm run tokens` turns it into `src/renderer/src/styles/tokens.css`.
- `components.css`: the design system's `.sl-*` component styles, with two changes: the Google Fonts import and the preview-page `body` rule are removed (fonts ship inside the app), and left/right are replaced by logical properties (`margin-inline-start`, `inset-inline-start`) so a right-to-left layout works later.
