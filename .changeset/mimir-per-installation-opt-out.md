---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-backend': patch
---

Add a per-installation Mimir opt-out: `gs.installations.<name>.mimirEnabled`.

`baseDomain` alone cannot signal that an installation runs the observability
stack — standalone installations must set it for other features (e.g. agent
avatars) while having no Mimir at `observability.<baseDomain>`, so every
metrics-backed card rendered a permanent error there (e.g. "Workloads (error)"
with an HTTP 406 from whatever answers that host).

With `mimirEnabled: false` (default: true):

- the frontend never sends Mimir queries for that installation,
- the workload status summary renders a neutral "Workloads (unavailable)"
  state with "Workload metrics are not available on this installation.",
- the metrics-only cards (Resource Usage, Hostnames and certificates) are
  hidden entirely,
- the backend Mimir proxy refuses queries for the installation with a 404.
