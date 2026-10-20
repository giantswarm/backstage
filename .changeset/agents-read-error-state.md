---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A failed agent read no longer shows as "No agents yet". When muster cannot say
which namespaces an environment's agents live in and the platform namespace
lists none, the environment counts as unread instead of read with no agents.
The home then shows "Couldn't load your agents" with a Retry button, which
reads the agents and muster's namespace answers again; "No agents yet" appears
only after a read that succeeded and found none.

A page load right after an agent list changed no longer shows the list as
it was before the change: the lists restored from the browser are read again
on the first load, and a restored empty list waits for that read instead of
showing "No agents yet".
