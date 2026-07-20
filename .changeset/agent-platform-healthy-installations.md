---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

Query only confirmed-healthy installations for the Agent Platform fleet lists,
and stop flagging kagent-absent clusters as read failures.

- `agent-platform`: `useReachableInstallations` now treats only `healthy` (not
  `connecting`) cluster-access state as reachable, so the agents list and the
  create-flow installation select no longer query or flag known-degraded /
  unreachable installations (the list stops churning wide-then-narrow on load).
  The "couldn't read" card is refined to `errored ∩ currently-healthy`.
- `agent-platform`: a `404` — the `kagent.dev` API group isn't installed on an
  otherwise-reachable cluster — is treated as a successful empty read. Such an
  installation contributes zero Agents / ModelConfigs and is no longer surfaced
  as "couldn't read"; only `403` (forbidden) and unreachable clusters are
  flagged. Applies to both the agents list and the create flow.
- `kubernetes-react`: add `isNotFoundError(errorInfo)` to classify a 404
  list/get error, distinct from a 403 or a transport failure.
- `gs`: raise the cluster-access probe timeout from 2s to 5s so slow-but-healthy
  clusters aren't transiently flagged degraded during load spikes.
