---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Request token usage from OpenAI-compatible streaming responses (vLLM/KServe) so `getContextUsage` can report context size, output tokens, and cost. Sends `stream_options: { include_usage: true }` on the chat-completions path.
