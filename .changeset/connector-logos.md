---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs': minor
---

Connectors show a logo: the icon muster read from the MCP server (`MCPServer` `.status.icon`), else a bundled brand mark matched by the connector URL's host, else the letter tile. `ConnectorLogo` and `resolveConnectorLogo` are exported from the muster plugin and used on the Connectors list, the connector page header and the agent overview, whose Connectors section now shows the agent's connectors as a row of logos named on hover or focus. Directly bound servers and `server:` selectors read by their display names. The gs plugin exports `GrafanaIcon`, `KubernetesIcon` and `AWSProviderIcon`.
