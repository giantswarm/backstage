---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent detail page keeps re-reading an agent's status after agent-manager
reports it failed, backing off from 5 s to a minute. It stops once the agent is
ready, once agent-manager no longer finds it, or after ten minutes of failure,
so a failure that clears by itself right after a create turns into Ready
without a reload.
