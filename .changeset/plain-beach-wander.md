---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

The agent wizard's tools step says what blocks Continue: the line by the button names the problem (the selector count against the limit, or the selectors that are not valid), says to fix it under Selected, and its Show the problem button opens the individual tools and moves the focus to the problem. Each connector card states in words whether it is connected, needs a sign-in or is not connected, why it lists no tools, why Read-only cannot be picked, and what is selected; the chosen Read-only or All carries a check. The muster plugin exports `CONNECTOR_REACH_LABELS` and the `ConnectorReach` type.
