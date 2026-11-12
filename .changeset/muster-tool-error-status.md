---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-gs-common': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@internal/backend-common': patch
---

A muster tool error no longer answers 500 when its kind is unknown.

- gs-node: a `MusterToolError` of no known kind answers 502
  (`MUSTER_UNKNOWN_TOOL_ERROR_STATUS`), a failure upstream of the portal,
  instead of the error middleware's 500; it still reaches Sentry. Its `status`
  is now always set. `isInfrastructureError` reads only a tool error of a
  known 5xx kind as a broken dependency, so a manager's own words of no known
  kind are still shown as its refusal. muster's failure texts match in either
  case, so `Tool not found: x` (a meta-tool's target) is `tool_not_found`, a
  502, like `tool not found: x`. model-manager's `no_backend:` is the new
  kind `no_backend`, a 503.
- gs-common: `forbidden` is one of model-manager's refusal codes, so its
  `forbidden:` answers 403 and stays out of Sentry.
- agent-platform: model-manager's `forbidden` reads as a `ForbiddenError`.
- backend-common: `no_backend` events are grouped per server in Sentry.
