---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent page's Toolset card says how muster holds the agent to it. Where
agent-manager binds the toolset to each session at its start (`get_info`
reports `toolsetBound`), it reads "Bound to each session at its start. A
change applies to new sessions."; elsewhere it reads as declared, with the
caveat that a process in the agent's sandbox that omits the X-Muster-Toolset
header is not held to it. Both add that a toolset is composition, not
authorization. The implicit-full-access and full-preset labels are unchanged.
