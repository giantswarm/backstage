---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Model hosting figures no longer repeat identically on every tab: Running models keeps the whole row, GPU pools shows only the GPU tiles (GPUs in use, GPU pools, GPU cost now) and Model cache only the cache tile. `ModelHostingKpis` takes a `scope` (`all`, `gpu`, `cache`) and renders nothing when its scope has no tile.
