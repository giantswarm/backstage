---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent detail, Tools tab: the Toolset card no longer greets every visitor with "Toolset not readable" before the toolset loads. While the agent's carrier `RemoteMCPServer` is being read the card says it is reading it, and it waits for the query's own answer (items or an error) rather than `isLoading`, which is still false on the render before a query starts fetching. Once the read has answered, the two causes it used to conflate are told apart: **Toolset not readable** when the namespace's `RemoteMCPServer`s could not be read at all — naming the namespace and installation — and **Gateway server missing** when the read came back without the server the agent binds the gateway through. The resolved list's own wait now holds itself back the same way, so a resolution served from cache, or one selector toggled in the create and edit flows, no longer flashes an indicator.
