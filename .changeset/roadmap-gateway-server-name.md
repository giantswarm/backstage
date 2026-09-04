---
'@giantswarm/backstage-plugin-roadmap-backend': patch
---

The roadmap backend takes the name of the pro MCP server from the muster
server gateway (`MusterServerGateway.server`) when it asks muster to connect
the caller, instead of reading it off the client by cast with a `pro`
fallback. No change in behaviour: the gateway has always named the server.
