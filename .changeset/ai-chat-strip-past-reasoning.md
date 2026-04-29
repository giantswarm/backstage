---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Strip reasoning content parts from assistant messages older than the last two user turns before sending them to the model. Past thinking blocks don't need to round-trip per Anthropic guidance, and removing them reclaims up to ~10K tokens per past turn for Claude conversations. The current turn (and the one before it) keeps reasoning intact so Anthropic extended thinking + tool_use mid-loop continues to work.
