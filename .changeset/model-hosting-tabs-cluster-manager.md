---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Model hosting draws its tabs at the all-installations scope wherever
cluster-manager runs, with or without a serving layer. Without model-manager
the GPU pools and Model cache tabs were unreachable there, though the Add GPU
node pool form points to Model cache for removing a kept cache.
