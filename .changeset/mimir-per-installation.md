---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs': minor
---

`gs.installations.<name>.mimir` points an installation's metrics at another Mimir (`url`, `tenant`) and limits every query of the installation to its `matchers`, for a platform on a workload cluster whose series land in its management cluster's Mimir. `MimirService` adds the matchers to every vector and matrix selector of the PromQL and refuses a query it cannot limit; installations without `mimir` are queried as before. gs-common exports the rewriter, `enforceMatchers`.
