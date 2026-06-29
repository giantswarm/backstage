---
'@giantswarm/backstage-plugin-gs': patch
---

Stop a single-cluster Kubernetes proxy read from being serialized behind the whole-fleet cluster-access warm-up, which made CRD-backed pages (e.g. the muster dashboard) show a multi-second spinner on a cold first load.

The headless `ClusterAccessConnector` proactively mints a cluster token and probes `/version` for every broker-covered installation on app load. Those probes shared the `KubernetesClient` concurrency lane with the page's own single-cluster read and were enqueued first, so the foreground read waited for the warm-up to drain (~9s on a 23-cluster fleet, with an unreachable cluster holding a slot for the full 10s default timeout).

- `KubernetesClient.proxy` now serves foreground (page) reads ahead of background warm-up probes when a concurrency slot frees, so a single-cluster read is no longer queued behind the whole-fleet warm-up.
- `KubernetesClient.proxy` accepts a per-request `timeoutMs` override; the cluster-access `/version` probe uses a short (2s) timeout so an unreachable cluster releases its slot quickly instead of dominating the tail.
