---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': patch
---

Fix scaffolder template fetch failing for entities registered via `giantswarm` location type by emitting `url` as the entity location type instead of `giantswarm`.
