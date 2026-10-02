---
'@giantswarm/backstage-plugin-gs': minor
---

Show Envoy Gateway policies in the cluster "Gateways" tab.

- `SecurityPolicy`, `BackendTrafficPolicy`, `ClientTrafficPolicy` and
  `EnvoyExtensionPolicy` with their targets (`spec.targetRefs`, and the
  deprecated `spec.targetRef`) and the `Accepted` condition per Gateway or
  ListenerSet they attach to. Rejected policies are listed first.
- A policy without any status on a cluster that exports policy status is
  flagged as "No status reported": Envoy Gateway writes none when the target
  doesn't exist, isn't managed by it, or before reconciling.
- Policy targets and status come from metrics added in
  giantswarm/observability-bundle#467. On clusters that don't export them yet,
  status is shown as "Not available".
