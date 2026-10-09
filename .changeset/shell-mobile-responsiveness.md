---
'app': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

The agent shell now works at phone width (375px). The shell publishes how much
of the viewport's bottom edge its fixed mobile bar covers as
`--agent-shell-mobile-bar-height` — the bar's 56px plus the iOS home-indicator
inset — and the session view's docked composer sticks above it instead of
being covered by it; in-flow pages (the home composer) clear the inset too.
Tables built on core-components scroll inside their own box at phone width
instead of widening the page. In the session view, long tool names in timeline
rows ellipsize rather than overflowing, and the approval card's caption and
buttons wrap onto separate lines. A workflow step's arguments grid on the
workflow detail page folds to one column below 420px, like the steps section's
grid already did.
