---
'@giantswarm/backstage-plugin-gs': minor
'app': patch
---

Cluster access is now established for every broker-covered installation on app load, independent of the current route, and the sidebar cluster-access status element is always visible (each installation starts in a new `connecting` state). Proxy requests — including broker token mints — are bounded by a global concurrency limit (`gs.kubernetes.proxyMaxConcurrency`, default 6) so the startup fan-out no longer overwhelms the broker and apiservers with a storm of simultaneous connections that intermittently time out before recovering.
