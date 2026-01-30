---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
'@giantswarm/backstage-plugin-ai-chat': patch
---

Add authentication provider support and multi-installation features for MCP servers

- Add `authProvider` configuration option to inject authentication tokens from request headers into MCP server requests
- Add `installation` option to prefix tool names and descriptions for multi-installation setups
- Add MCP resources loading and expose them as callable tools
- Add `deduplicateToolCallIds` utility to fix Anthropic API errors with duplicate tool call IDs
- Add TypeScript config schema for AI chat configuration
