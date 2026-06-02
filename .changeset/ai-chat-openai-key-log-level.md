---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Log the "no OpenAI API key configured" message at `info` instead of `warn`. This is the expected state when a customer hasn't set up the AI chat feature, so it should no longer be forwarded to Sentry as an error-level event.
