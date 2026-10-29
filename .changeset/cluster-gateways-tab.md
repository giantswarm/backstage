---
'@giantswarm/backstage-plugin-gs': minor
---

Add a "Gateways" tab to the cluster detail page showing the cluster's Gateway
API setup from Mimir metrics.

- Gateways with their class, `Accepted`/`Programmed` conditions and listeners
  (protocol, port, hostname, attached routes).
- HTTPRoutes with their hostnames and Gateway or ListenerSet parents, and the
  `Accepted` and `ResolvedRefs` condition of each parent, with the reason when
  it fails.
- Failing Gateways and routes are listed first, followed by those without a
  reported status.
- Route conditions come from metrics added in observability-bundle 3.6.0
  (giantswarm/observability-bundle#467). On clusters with an older bundle they
  are shown as "Not available", never as healthy.
