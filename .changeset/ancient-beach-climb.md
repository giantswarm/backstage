---
'@giantswarm/backstage-plugin-ai-chat': patch
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Pin `ai` to a single version via root yarn resolution to fix `AI_TypeValidationError` when invoking MCP tools. The backend's `ai@6.0.177` emitted `tool-input-available` chunks with a new `toolMetadata` field that the client's older nested `ai@6.0.168` (pinned by `@ai-sdk/react`) rejected as an unrecognized key.
