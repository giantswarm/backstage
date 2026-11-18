---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

An organization's connector has a page address of its own, `/customize/connectors/<installation>/-/<namespace>/<name>`, so two organizations' connectors of one name each open their page from the Connectors list, the command palette, an agent's tools and Usage. Its old address, `…/<installation>/<name>`, redirects there while the name is unique on the installation and otherwise lists the connectors of that name. The muster plugin exports the `mcpOrganizationServer` and `mcpOrganizationServerTool` routes and `connectorPageParams`.
