---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs-common': patch
---

Fixture mode serves muster's data, outside production builds only: the connectors in every state, their tools, resources and prompts, the person's sign-in status, toolsets and presets, the workflows and their runs with steps and statistics, and MCP usage and latency, all from the base data set; the unreachable installation's reads fail as they do for real. `@giantswarm/backstage-plugin-muster/fixtures` exports the `MCPServer` and `Workflow` objects the fixture Kubernetes API lists, and the fixture data set has toolset presets.
