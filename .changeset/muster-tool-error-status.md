---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@internal/backend-common': patch
---

More muster tool errors get their own status instead of a 500.

- gs-node: muster's `Tool not found: x`, its answer for a meta-tool's target
  (`describe_tool`), is `tool_not_found` (502) like `tool not found: x`.
  model-manager's `forbidden:` is a refusal (403, out of Sentry), and its
  `no_backend:` the new kind `no_backend` (503). A tool error of no known
  kind stays 500.
- gs-common: `forbidden` is one of model-manager's refusal codes.
  `MODEL_MANAGER_FAILURE_CODES` and `mcpToolFailureOf` name the failures of a
  whole server, model-manager's `no_backend` for now, next to the refusals.
- agent-platform: model-manager's `forbidden` reads as a `ForbiddenError` and
  `no_backend` as a `ServiceUnavailableError`, neither retried.
- backend-common: `no_backend` events are grouped per server in Sentry. A
  server-wide kind whose tool names no server (a meta-tool's missing target)
  is grouped by its message instead of all in one issue.
