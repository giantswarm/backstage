---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent detail page keeps re-reading an agent's status every 15 s after
agent-manager reports it failed, and stops once the agent is ready, so a
failure that clears by itself right after a create turns into Ready without a
reload.
