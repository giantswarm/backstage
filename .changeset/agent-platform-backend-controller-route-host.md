---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Derive the kagent controller's gRPC origin as `https://agentgateway.<baseDomain>`
instead of `https://kagent.<baseDomain>`.

The connectivity chart serves the controller's gRPC services (its `GRPCRoute`)
on `agent-platform.kagent.controllerHostname`, which is
`kagent.controllerRoute.hostname` or `agentgateway.<domain>` by default — the
same origin the chart writes as `apiBaseUrl` when it renders the Backstage
app-config itself. `kagent.<baseDomain>` is the kagent UI's `HTTPRoute` behind
oauth2-proxy and carries no gRPC: a call there ended with "server closed the
stream without sending trailers", so a fleet instance without an explicit
`agentPlatform.kagent.installations.<name>.apiBaseUrl` could not reach any
installation's controller. The per-installation `apiBaseUrl` override is
unchanged.

Also: `GET /kagent/session-states` answers in candidate order (the newest
session first) rather than in the order the concurrent task reads happened to
finish, so two evaluations of the same account answer alike.
