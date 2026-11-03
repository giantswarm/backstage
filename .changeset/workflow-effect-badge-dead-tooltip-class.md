---
'@giantswarm/backstage-plugin-muster': patch
---

`WorkflowEffectBadge` no longer passes a class to its bui `Tooltip`, which
drops it: the class's 280px width never applied. Nothing changes on screen; the
tooltip keeps bui's own width.
