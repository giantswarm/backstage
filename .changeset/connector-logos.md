---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Connectors show a logo: the icon muster wrote to the `MCPServer`'s `.status.icon` (the server's own, or muster's mark for a known service), else the letter tile. `ConnectorLogo` is exported from the muster plugin and used on the Connectors list, the connector page header and the agent overview, whose Connectors section now shows the agent's connectors as a row of logos named on hover or focus. Directly bound servers and `server:` selectors read by their display names. `ui-react` exports `HintTooltip`, the tap-friendly hint on a badge or a logo that the connector logos and the workflow effect badge share.
