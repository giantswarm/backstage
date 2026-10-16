---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A failed agent read no longer shows as "No agents yet". When muster cannot say
which namespaces an environment's agents live in and the platform namespace
lists none, the environment counts as unread instead of read with no agents.
The home then shows "Couldn't load your agents" with a Retry button, which
reads the agents and muster's namespace answers again; "No agents yet" appears
only after a read that succeeded and found none.
