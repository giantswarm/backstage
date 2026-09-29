---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': minor
---

Decide whether an installation's muster carries a server by the name muster exposes it under (`family.name ?? toolPrefix ?? name`), not by the MCPServer's own name. A server declared with a `toolPrefix` is addressed by that prefix — `gazelle-mcp-marge` exposes `x_marge_<tool>` — so matching the name alone reported it as absent on every installation that runs it. `McpServerRuntime` now carries `toolPrefix` and `family`, and the muster plugin exports that type.
