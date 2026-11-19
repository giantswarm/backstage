---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Connectors list no longer crashes when two organizations each own a connector of the same name: each is its own row, with its own state, tools and sign-in. A connector is identified by muster's key for it, read from muster's own `/servers/names` answer (so a muster outside the chart's namespace keeps working): its name in muster's namespace, `<namespace>/<name>` in an organization's. The list, its tools (`x_<namespace>_<name>_…`), the connector page's sign-in, Reconnect and Turn off/on, its resource and prompt counts, the usage and the Workflows page all use that key. An organization's connector offers no Edit or Remove, which muster refuses for it. While another connector shares its name, an organization's connector has no page link, in the list and in the command palette, where each such connector is its own entry under its display name. The muster plugin exports `connectorToolNamePrefix`, `isOrganizationServerKey`, `useMusterKeyedServers` and `serverListRows`.
