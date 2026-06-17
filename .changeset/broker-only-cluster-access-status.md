---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs': minor
---

Make broker-backed cluster auth broker-only and surface per-cluster access health in the sidebar.

Broker-covered kubernetes providers no longer fall back to the cookie `/refresh` or open per-cluster login popups: `createSession`/`refreshSession` mint silently through the muster token broker and, on failure, throw a typed `ClusterTokenError` carrying the installation and a coarse `reason`. The auth backend's cluster-token route now returns that `reason` (`broker_unreachable`, `exchange_failed`, `subject_invalid`) alongside the error. When the main Dex session is gone the connector triggers the single main SSO login automatically (the only popup a broker-backed cluster ever causes).

A new in-memory `ClusterAccessStatusApi` records per-installation access outcomes (healthy / degraded / session-expired), fed by both the broker token flow and the clusters list, and rendered by a `ClusterAccessStatusSidebarItem` connection-status element with a "Sign in again" action when the main session has expired.

The clusters list now loads fleet-wide fail-fast: API discovery and list queries are enabled per cluster as each one settles, the k8s proxy bounds each request with a configurable timeout (`gs.kubernetes.proxyTimeoutMs`, default 10s), and the table renders as soon as the first installation resolves instead of freezing on a single unreachable management cluster.
