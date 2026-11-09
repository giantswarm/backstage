---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-repositories': patch
---

Polling stops from hidden tabs and after a permanent error. `ui-react` adds
`pollingQueryOptions` and `isPermanentReadError`: a query spreads the options
and polls only while the tab is visible, reads again as it becomes visible,
and stops after a 401, a 403 or a "not connected" answer until a read
succeeds again. `muster` adds `musterPollingOptions` and
`isPermanentMusterReadError`, which also stop on muster's
`server_sign_in_required` and a portal session that is gone.

The model-manager reads of the Serving view (`list_backends`, `list_models`,
`list_nodes`), the pull jobs, the GPU node pools, workspaces, toolchain
builds, session reads, the Kubernetes and Mimir polls, muster's status and
connector reads and the repositories watches follow the rule. Where muster
asks the person to sign in to model-manager, the Serving view offers the
sign-in instead of the read warning, and polling resumes once it lands.
