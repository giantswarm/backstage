---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

The agent wizard's Tools step shows a connector muster does not reach by its connection, in the Customize page's words (Not connected, Partly connected, Deactivated), on its card, its catalogue row and its group's summary, instead of "0 tools"; tools chosen from it that it cannot list now are counted on its card, and give way when its access is changed. The muster plugin exports `CONNECTOR_REACH_LABELS`.
