---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The model configs list is now the Models tab's own page, at
`/agent-platform/models`, and the second-level tab row appears only where
there is more than one view to switch between.

The list used to sit behind a "Model configs" tab at
`/agent-platform/models/configs`. On a portal whose installations have no
serving layer — which is most of them — that row held a single tab, leading
back to the page it was already on, and the extra path segment said nothing
the tab above it had not already said.

Where a reachable installation does have a serving layer, the row is back to
three tabs: **Model configs** (now pointing at the tab root), Serving and GPU
capacity.

The create and detail flows move up with the list, to
`/agent-platform/models/new` and
`/agent-platform/models/<installation>/<namespace>/<name>` — where they lived
before the tab row existed. Every `…/models/configs/…` link still resolves:
those paths redirect, as the pre-tab-row ones already did.
