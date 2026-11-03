---
'@giantswarm/backstage-plugin-muster': minor
---

Customize's Connectors tab is one list: registered connectors first, then the platform's own, which carry a read-only tag from their tool-group label (`infrastructure`, `agent-platform`) for the Tags filter, search and tag links. The Your connectors, Infrastructure and Internal sub-tabs are gone; their addresses redirect to the list with `?tags=`. Until a connector is registered, the list starts with how to add one. An infrastructure family's page says it has an instance per management cluster. Exports `RETIRED_CONNECTOR_GROUP_TAGS` in place of `CONNECTOR_GROUPS`, `connectorGroupInfo`, `connectorGroupOfPath` and `LEGACY_CONNECTOR_GROUP_PATHS`; `useMusterCustomizeCounts` no longer returns `connectorGroups`.
