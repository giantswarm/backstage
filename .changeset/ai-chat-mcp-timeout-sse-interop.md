---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-gs-node': patch
---

Fix AI chat hanging forever when an MCP server is slow or its responses are dropped by the transport.

- MCP servers are now connected in parallel and each connection/tool-load is bounded by a timeout (15s default, configurable per server via `aiChat.mcp[].timeoutMs`). A hanging server is reported as failed and the chat continues with the remaining servers' tools.
- Patch `@ai-sdk/mcp` to treat SSE events without an explicit `event:` field as `message` events, per the SSE specification. MCP servers behind agentgateway emit bare `data:` frames, which the unpatched client silently dropped — leaving the request promise pending forever and hanging the whole chat request.
