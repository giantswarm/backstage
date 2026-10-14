---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': minor
---

Cluster page: **Delete** shows only on a cluster create_cluster made (rendered
by a HelmRelease of its own name in its organization's namespace), the only
kind cluster-manager's `delete_cluster` removes; App-based clusters,
GitOps-managed ones among them, no longer offer a dialog that can only report
the refusal. `useClusterPageTarget` reports the cluster's `helmRelease`.
