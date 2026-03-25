---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Fix MCP tool names with dots breaking AI SDK. Sanitize MCP tool names to match AI SDK's required pattern by replacing invalid characters like dots with underscores.
