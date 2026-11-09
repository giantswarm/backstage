---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-flux': patch
'@giantswarm/backstage-plugin-repositories': patch
---

Polling stops from hidden tabs and after a permanent error. `ui-react` adds
`pollingQueryOptions`, `isPermanentReadError` and `causeChain`: a query
spreads the options and polls only while the tab is visible, reads again as
it becomes visible where its data is stale, and stops after a 401, a 403 or a
"not connected" answer until a read succeeds again; a stopped query is not
read on becoming visible either. `inBackground` keeps a poll going from a
hidden tab while the caller has a reason, and `refetchOnVisible: false`
leaves the read on becoming visible to the next tick. `muster` adds
`musterPollingOptions` and `isPermanentMusterReadError`, which also stop on
muster's `server_sign_in_required` and a portal session that is gone. The
retry policies of the gs, flux, repositories and muster clients and of the
Mimir queries build on the same classifier.

The model-manager reads of the Serving view (`list_backends`, `list_models`,
`list_nodes`), the pull jobs, the GPU node pools, workspaces, toolchain
builds, session reads, the Kubernetes and Mimir polls, muster's status and
connector reads and the repositories watches follow the rule. The GPU node
pools read polls from a hidden tab only while a pool is being deployed, and
the inventory only while a served model is on its way in, so a pool's serve
intent still loads its model meanwhile. Where muster asks the person to sign
in to model-manager, the Serving view offers the sign-in, and polling resumes
once it lands.
