# @giantswarm/backstage-plugin-muster

## 0.2.0

### Minor Changes

- c117a5e: Support muster MCP servers behind per-user auth (`authProvider` entries in
  `aiChat.mcp`): the muster frontend now forwards the user's OAuth token to the
  muster-backend proxy, which opens per-user MCP sessions. Previously such
  servers were reported as unconfigured and the Workflows page failed with a 503.

  Also addresses review feedback on the initial muster plugins: the shared MCP
  client cache moved from ai-chat-backend to `@giantswarm/backstage-plugin-gs-node`
  and is reused by muster-backend; config parsing no longer throws on unnamed
  `aiChat.mcp` entries; muster-backend uses `@backstage/errors` classes instead
  of a hand-rolled error middleware; query parameter validation rejects empty
  and repeated values; execution fetch errors are surfaced in the UI instead of
  being silently swallowed; duplicate workflow step ids no longer drop nodes
  from the graph; and `formatDuration` is shared instead of copy-pasted.

## 0.1.0

### Minor Changes

- 41a2afb: Add muster workflow visualization: a new `muster` frontend plugin renders
  workflow definitions as flow diagrams (one node per step, dashed condition
  edges) with execution history and live per-step status overlay, backed by a
  new `muster-backend` plugin that proxies the muster MCP server's
  `core_workflow_*` tools over REST (reusing the `aiChat.mcp` entry named
  `muster`).
