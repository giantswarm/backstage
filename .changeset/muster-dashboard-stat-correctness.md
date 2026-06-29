---
'@giantswarm/backstage-plugin-muster': patch
---

Fix the muster dashboard "Servers healthy" stat.

- The stat no longer flips to amber on every remote federated-backend failure. muster federates ~26 management clusters, so at least one backend is almost always degraded; colouring on `healthy != total` made the stat near-permanently amber and useless as a signal. It now warns only when a meaningful fraction (>10%) of aggregated servers is unhealthy, via the shared `serversHealthSummary` helper.
- The stat now renders whenever the server list has loaded, independent of the muster session. It is computed from the CRD `.status.state` reads (not the auth probe) -- the same data the fleet-health pills below already render unauthenticated -- so hiding only the summary stat when unauthenticated was inconsistent.
