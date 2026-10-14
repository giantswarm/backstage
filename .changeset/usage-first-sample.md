---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Usage no longer drops the first model call of every gateway metric series. The
LLM usage queries (cost, tokens, calls, latency and speed quantiles, request
status, unpriced lookups, the daily charts, today's bar and the session $/token
rates) now count a series born inside the window as growing from zero: its
first value is added to its `increase()` when it has no sample in the hour
before the window starts. On a fresh installation the portal showed about half
the real spend.
