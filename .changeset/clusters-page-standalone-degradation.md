---
'@giantswarm/backstage-plugin-gs': patch
---

Degrade the Clusters page gracefully on installations without Cluster API.

A standalone installation with the Clusters page enabled doesn't serve
`cluster.x-k8s.io` at all. That 404 is now rendered as an empty cluster list
instead of a permanent error banner, and the sidebar cluster-access status
treats it as healthy (the apiserver answered authoritatively) instead of
degraded. Companion to the Deployments-pages change from #2169.
