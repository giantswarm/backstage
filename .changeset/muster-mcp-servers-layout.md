---
'@giantswarm/backstage-plugin-muster': minor
---

Refine the muster MCP-servers layout so families read as collapsible servers and muster itself reads as one of them.

- Standard server families now start collapsed (no longer auto-expanding the first row), so the page opens as a scannable list of server families.
- muster core is rendered as a server-style disclosure ("muster — core / control plane"), collapsed by default and consistent with the standard/integration server rows, reflecting that muster itself is an MCP server.
