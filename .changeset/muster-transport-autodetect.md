---
'@giantswarm/backstage-plugin-muster': minor
---

The MCP server registration wizard now detects the server's transport automatically. Once the URL on the details step looks complete, muster probes it via the new `core_mcpserver_detect` tool (muster ≥ 5.3.0, giantswarm/muster#1087) and the detected transport — streamable-http or SSE — is pre-selected with a "Detected" badge on the matching card. Manually picking a transport still wins until the URL changes again, and detection degrades silently to manual selection when the probe is inconclusive, the user has no muster session yet, or the installation runs an older muster without the tool.
