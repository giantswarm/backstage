---
'@giantswarm/backstage-plugin-muster': patch
---

Fixture mode serves muster's data, outside production builds only: the connectors in every state, their tools, resources and prompts, the person's sign-in status, the workflows and their runs with steps and statistics, and MCP usage and latency, all from the base data set. `@giantswarm/backstage-plugin-muster/fixtures` exports the `MCPServer` and `Workflow` objects the fixture Kubernetes API lists.
