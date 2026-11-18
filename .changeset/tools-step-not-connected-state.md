---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

A connector muster does not reach no longer reads as one without tools. The agent wizard's Tools step shows its connection in the Customize page's words (Not connected, Partly connected, Deactivated) on its card, its catalogue row and its group's summary, instead of "0 tools", and counts the tools chosen from it that it cannot list now. The Connectors list shows "—" in its Tools column instead of "0 tools", and the connector's page says it is disconnected (or its state) and so shows no tools, with no count on its Tools tab. The muster plugin exports `CONNECTOR_REACH_LABELS`.
