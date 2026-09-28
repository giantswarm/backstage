---
'backend': patch
---

The backend no longer traces the `/.backstage/health/` requests, the kubelet's readiness and liveness probes.
