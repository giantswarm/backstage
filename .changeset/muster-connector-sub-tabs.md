---
'@giantswarm/backstage-plugin-muster': minor
---

Customize › Connectors splits into three sub-tabs, sorted by the
`agent-platform.giantswarm.io/tool-group` label, families and single servers
alike: **Your connectors** (the default, at `/customize/connectors`) lists
what has no label, the customer's own families included; **Infrastructure**
(`/customize/connectors/infrastructure`; the earlier `families` path
redirects there) what is labelled `infrastructure`; and **Internal**
(`/customize/connectors/internal`) what is labelled `agent-platform`, and
muster itself. muster's page shows its endpoint with a copy button above its
tabs; its row's state follows the backend's reachability probe, its session
and whether it listed its tools. A search that finds nothing on a sub-tab, or
lands on an empty one, names the sub-tabs where it matches. Every Connectors
crumb of a connector and of its tools leads to the connector's sub-tab. New
exports: `CONNECTOR_GROUPS`, `connectorGroupInfo`, `connectorGroupOfPath`,
`LEGACY_CONNECTOR_GROUP_PATHS` and the `ConnectorGroup` types;
`useMusterCustomizeCounts` adds `connectorGroups`, and its `connectors` count
includes muster where muster runs.
