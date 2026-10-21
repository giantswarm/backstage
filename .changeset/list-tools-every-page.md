---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

`MusterMcpClient.listTools` reads every page of muster's `list_tools`, so the agent wizard's Tools step lists the whole catalogue; an organization's MCP server's tools land on its own tile.
