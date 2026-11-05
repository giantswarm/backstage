---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Model hosting is offered wherever cluster-manager runs, with or without a
serving layer: the Model hosting entry on Customize → Models shows, and the
page draws its tabs at the all-installations scope. Without model-manager the
GPU pools and Model cache tabs were unreachable there, though the Add GPU node
pool form points to Model cache for removing a kept cache.
