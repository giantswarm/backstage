---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Rebuild MCP clients when the underlying transport closes. The AI chat backend caches one `MCPClient` per server for 30 minutes, but the cache was holding on to clients whose StreamableHTTP transport had already been torn down by muster (idle timeout, server reset, …). Tool calls then failed with `MCPClientError: Attempted to send a request from a closed client` until the TTL expired, surfacing in the browser as a "network error" banner. The cache now chains into the transport's `onclose` callback and evicts the entry as soon as the connection drops, so the next request rebuilds the client cleanly. Tool execution also detects the same SDK error eagerly and marks the entry dead so a single failure -- not a 30-minute window -- triggers reconnection.
