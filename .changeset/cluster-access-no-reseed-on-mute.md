---
'@giantswarm/backstage-plugin-gs': patch
---

Fix a grey-flicker regression in the sidebar Cluster access widget: muting or
un-muting one installation reset every other installation's dot back to
"connecting" (grey) until it re-probed. The connector re-runs its probe effect
on every muted-set change and was re-seeding all installations to `connecting`
each time; it now seeds only installations not already tracked, so
already-resolved (healthy/degraded) clusters keep their state when another
installation is toggled.
