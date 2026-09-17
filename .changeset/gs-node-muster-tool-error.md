---
'@giantswarm/backstage-plugin-gs-node': patch
---

`MusterMcpClient` throws `MusterToolError` for a tool-level error (`isError`): the message is the tool's first text block as before, its further text blocks travel as `details` — cluster-manager's `delete_node_pool` puts its structured refusal (`{"refused": {nodes, models, hint}}`) in a second block next to the text, which was dropped before.
