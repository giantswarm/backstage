---
'@giantswarm/backstage-plugin-agent-platform': patch
---

LLM usage over a one-day window no longer issues a range query that ends before it starts: the daily charts show today alone. `useLlmUsage` reports the window it rounds `days` to, the same one its queries cover.
