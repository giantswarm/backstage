---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Add `useBackstageUserToken` option to `aiChat.mcp` server entries. When set to `true`, the chat backend uses Backstage's `AuthService` to mint a token on behalf of the calling user, scoped to the built-in `mcp-actions` plugin, and sends it to the MCP server as `Authorization: Bearer <token>`. This lets the in-process `mcp-actions` MCP server run actions as the logged-in user, so user-context tools like `auth.who-am-i` work without configuring a static external-access token.
