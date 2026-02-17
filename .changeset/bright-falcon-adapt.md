---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Fix tool call sanitization for AI SDK v6 compatibility: add missing `input` field fallback and handle array-based tool-result messages.
