---
'@giantswarm/backstage-plugin-muster': minor
---

Customize › Connectors splits into three sub-tabs, sorted by the
`agent-platform.giantswarm.io/tool-group` label and by whether a server is a
family: **Your connectors** (the default, at `/customize/connectors`) lists
the single servers without the label, **Families**
(`/customize/connectors/families`) every family not labelled
`agent-platform`, and **Internal** (`/customize/connectors/internal`) the
`agent-platform` servers, single `infrastructure` servers and muster itself.
muster's row and page show its endpoint with a copy button; its state follows
the backend's reachability probe, its session and whether it listed its tools.
A search that finds nothing on a sub-tab, or lands on an empty one, names the
sub-tabs where it matches. Every Connectors crumb of a connector and of its
tools leads to the connector's sub-tab. New exports: `CONNECTOR_GROUPS`,
`connectorGroupInfo`, `connectorGroupOfPath` and the `ConnectorGroup` types;
`useMusterCustomizeCounts` adds `connectorGroups`, and its `connectors` count
includes muster where muster runs.
