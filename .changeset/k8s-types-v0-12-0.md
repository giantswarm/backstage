---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

`@giantswarm/k8s-types` moves to v0.12.0: the CRD types follow the versions
deployed on Giant Swarm management clusters (the Giant Swarm forks of CAPI,
CAPA, CAPZ and CAPVCD, and the deployed CAPV, Crossplane AWS provider and App
platform releases) instead of commits on upstream `main`. Fields that only
upstream `main` had are gone from the types; none of them is used here.
