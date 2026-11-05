---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Show a connector's "Calls, last 30 days" line on its Details tab from the first
paint, with a skeleton until the usage is read, so the facts below it no longer
jump. Where there is no figure the line says why: no muster session (and why
not), no usage metrics on the environment, or a failed read.

`CellSkeleton`, the one-line placeholder for a value still being read, moves
from agent-platform to `ui-react` and takes a `body-medium` variant and an
accessible `label`.
