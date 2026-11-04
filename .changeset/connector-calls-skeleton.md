---
'@giantswarm/backstage-plugin-muster': patch
---

Show a connector's "Calls, last 30 days" line on its Details tab from the first
paint, with a skeleton until the usage is read, so the facts below it no longer
jump. Where there is no figure the line says why: no muster session, no usage
metrics on the environment, or a failed read.
