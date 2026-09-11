---
'@giantswarm/backstage-plugin-agent-platform-backend': major
'@giantswarm/backstage-plugin-agent-platform-common': major
'@giantswarm/backstage-plugin-agent-platform': major
---

The Agent Platform backend speaks **kagent API v2 over native gRPC**. Sessions
are the person's `AgentInstance`s, chat is A2A v1 `SendStreamingMessage` routed
by the instance header with the human-in-the-loop extension requested on every
turn, history comes from `ListTasks`/`GetTask`, the identity probe from
`SystemService.GetCurrentUser`, and the session-state and usage summaries are
derived from `ListAgentInstances` and `ListTasks`. The browser keeps its
JSON/SSE contract.

**Breaking.** This release requires a kagent API v2 controller behind
agentgateway's gRPC-capable controller route (agent-platform 4.0's connectivity
chart). `agentPlatform.kagent.installations.<name>.apiBaseUrl` is now the
**gRPC origin** of that route (`https://<host>[:port]`, no path); the derived
default is `https://kagent.<baseDomain>`. The kagent 0.10 REST door
(`/api/sessions`, JSON-RPC A2A) is no longer spoken, and conversations from
before an installation's migration are not available — the Sessions tab says so.

- **Backend.** A Connect client generated from the line's protos
  (`plugins/agent-platform-backend/src/kagent/gen`, pinned by commit) over
  connect-node's HTTP/2 gRPC transport. Every call carries
  `authorization: Bearer <the person's per-installation Dex ID token>` and
  **no identity header**: agentgateway validates the token and derives the
  caller. Creating a session is `CreateAgentInstance` on the template's Ready
  Harness with the browser's `requestId`, so a retried create yields one
  instance; renaming is `UpdateAgentInstanceName`; the 0.9.x upsert fallback is
  gone. The new route `POST /kagent/sessions/:sessionId/tasks/:taskId/cancel`
  cancels a turn server-side (`CancelTask`). The reachability probe behind
  `GET /kagent/installations` is one unauthenticated `GetVersion` per origin.
- **Common.** The A2A v1 and AgentInstance wire shapes join the 0.10 ones, with
  fixtures recorded on the pinned line (`kagent-4a91c273`), and are normalised
  into the one internal shape every reader already parses — including the HITL
  extension's typed request and reply. `KagentSession` gains `agentTemplate`,
  `state`, `contextId` and `failure`.
- **Frontend.** A **Stop** control in the composer while a turn streams; the
  create carries an idempotency key per submission; the Sessions tab and an
  agent's Recent sessions tell the person that earlier conversations are gone.
  Session names are capped at 200 characters, the controller's limit.
