---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

The Connectors tab's Sign in button sits in a column of its own beside the state, so it lines up across rows instead of wrapping under the state; a label too wide for the column wraps inside the button, and a state too wide for the Status column wraps instead of being cut off. On a phone, an outstanding sign-in's "Open sign-in page" stays at the end of the row's first line. The answer to a Sign in or Sign out click is shared by every place that shows the same connector, so they no longer disagree. `StatusDot` takes `wrap` to wrap its label instead of truncating it.
