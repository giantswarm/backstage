---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
---

The MCP Servers picker lists the installations whose inventory has muster.
The muster backend derives one installation per `gs.installations` entry with
a `baseDomain`, at `https://muster.<baseDomain>/mcp`, so an installation that
adopts muster appears without any portal configuration; `muster.installations`
entries now override that derived list (`url`, `headers`, `prometheusServer`,
`authProvider` per name) or add installations the fleet configuration does not
know. `GET /api/muster/installations` reports each installation's `source`
(`derived` or `configured`) next to its reachability; derived installations
always require the person's token, which the frontend mints the same way as
for configured ones (main-login token for the home installation, the
installation's brokered token otherwise). The picker intersects the backend's
installations with the inventory's `muster.giantswarm.io` group, home first,
keeps a deep-linked installation while its probe is pending, marks
installations that are not reachable from this portal, and the live-MCP
screens (tool explorer, MCP usage, runtime state) say so instead of offering a
connect that cannot help. A portal without `gs.installations` keeps the legacy
single-installation setup.
