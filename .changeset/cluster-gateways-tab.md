---
'@giantswarm/backstage-plugin-gs': minor
---

Add a "Gateways" tab to the cluster detail page showing the cluster's Gateway
API setup from Mimir metrics.

- Gateways with their class, `Accepted`/`Programmed` conditions and listeners
  (protocol, port, hostname, attached routes).
- HTTPRoutes with their hostnames and Gateway parents, and the `Accepted` and
  `ResolvedRefs` condition of each parent with its reason. Routes with a
  failing condition are listed first.
- Route conditions come from metrics added in giantswarm/observability-bundle#467.
  On clusters that don't export them yet they are shown as "Not available",
  never as healthy.
