---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-bot-prs': patch
'@internal/backend-common': patch
---

Name the tool, its MCP server and the installation on a muster tool error, and give each known kind of failure its status: agent-manager's refusals and muster's refusals of a connector write answer 4xx and no longer reach Sentry, a muster rollout's interruption is logged at info and answered with a 503 the muster pages retry, and a timeout (504), a server muster holds no connection to (503) and a missing tool (502) stay reported. Sentry groups muster tool errors by kind and tool. `gs-node` adds `MUSTER_TOOL_ERROR_STATUS`, `musterToolErrorKindOf`, `musterServerOfTool` and `markReported`; `gs-common` adds `AGENT_MANAGER_REFUSAL_CODES`. bot-prs keeps offering the marge sign-in for a missing tool or a lost connection.
