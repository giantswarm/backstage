---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Show times that can be yesterday or tomorrow relative to now instead of as a
bare clock time, which read as today:

- A loaded model's eviction on the models list and the hosting page:
  `evicts in about 3 hours`, with the date and time on hover.
- When a node's model cache was scanned, in the GPU capacity hover:
  `scanned 2 days ago (2 Sep 2026, 13:05:00 CEST)`.
- A stalled turn in a session: `The agent last reported progress 12 minutes
  ago.`, with the date and time on hover.
