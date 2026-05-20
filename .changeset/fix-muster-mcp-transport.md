---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Fix muster MCP connection by dropping the obsolete custom session-aware transport that broke against `@modelcontextprotocol/sdk` 1.29.0. Muster now uses the spec-standard `Mcp-Session-Id` header, which `@ai-sdk/mcp`'s built-in HTTP transport handles natively.
