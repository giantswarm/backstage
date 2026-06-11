# @giantswarm/backstage-plugin-muster-backend

## 0.2.3

### Patch Changes

- 95d1e6e: Fixed the workflow endpoints failing with "tool not found" against real muster servers. The muster aggregator only exposes its meta-tools (`list_tools`, `call_tool`, ...) over MCP, so the proxy now invokes the core workflow tools through the `call_tool` meta-tool and unwraps its result envelope.

## 0.2.2

### Patch Changes

- f84adcc: Fix AI chat hanging forever when an MCP server is slow or its responses are dropped by the transport.
  - MCP servers are now connected in parallel and each connection/tool-load is bounded by a timeout (15s default, configurable per server via `aiChat.mcp[].timeoutMs`). A hanging server is reported as failed and the chat continues with the remaining servers' tools.
  - Patch `@ai-sdk/mcp` to treat SSE events without an explicit `event:` field as `message` events, per the SSE specification. MCP servers behind agentgateway emit bare `data:` frames, which the unpatched client silently dropped — leaving the request promise pending forever and hanging the whole chat request.

- Updated dependencies [f84adcc]
  - @giantswarm/backstage-plugin-gs-node@0.3.1

## 0.2.1

### Patch Changes

- db81de5: Fix the muster Workflows page failing with 401 ("requires a user token for
  auth provider ... but the request did not include one") when the muster MCP
  server uses per-user auth.

  The muster frontend resolves the server's `authProvider` by matching the
  `aiChat.mcp` entry by `name`, but `name` was not declared frontend-visible in
  the config schema, so the browser never saw it, never resolved the auth
  provider, and never sent the auth header. `aiChat.mcp[].name` is now
  `@visibility frontend`, and `muster.serverName` is declared frontend-visible
  in the muster frontend plugin's own config schema so overriding the entry
  name also works in the browser.

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

### Patch Changes

- Updated dependencies [c117a5e]
  - @giantswarm/backstage-plugin-gs-node@0.3.0

## 0.1.0

### Minor Changes

- 41a2afb: Add muster workflow visualization: a new `muster` frontend plugin renders
  workflow definitions as flow diagrams (one node per step, dashed condition
  edges) with execution history and live per-step status overlay, backed by a
  new `muster-backend` plugin that proxies the muster MCP server's
  `core_workflow_*` tools over REST (reusing the `aiChat.mcp` entry named
  `muster`).
