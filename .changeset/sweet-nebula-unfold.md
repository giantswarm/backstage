---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Flush SSE chunks through compression middleware so streamed AI responses
reach the client in real time instead of arriving as a single batch.
