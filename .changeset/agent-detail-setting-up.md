---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent detail page: a new agent that fails only because the RemoteMCPServer (or
another object) it refers to has not been created yet — `ResolvedRefs=False`
with a message that says `not found` — shows as **Setting up** for three
minutes after its creation instead of "did not become ready", and as the
failure only after that. Every other failure, and any failure of an agent that
is not new, is shown at once. The page keeps re-reading the agent, backing off
from 5 s to 60 s, so it turns ready without a reload.
