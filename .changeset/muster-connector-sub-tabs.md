---
'@giantswarm/backstage-plugin-muster': minor
---

Customize › Connectors splits into three sub-tabs, sorted by the
`agent-platform.giantswarm.io/tool-group` label: **Your connectors** (the
default, at `/customize/connectors`) lists the servers without the label,
**Families** (`/customize/connectors/families`) the `infrastructure` families
and any unlabelled family, and **Internal** (`/customize/connectors/internal`)
the `agent-platform` servers and muster itself. muster's row and page show its
endpoint with a copy button. A search that finds nothing on one sub-tab names
the sub-tabs where it matches. A connector page's Connectors crumb leads to its
sub-tab. New exports: `CONNECTOR_GROUPS`, `connectorGroupOfPath` and the
`ConnectorGroup` types; `useMusterCustomizeCounts` adds `connectorGroups`, and
its `connectors` count now includes muster.
