---
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
---

muster's own entry among the connectors shows the logo muster announces, and
the portal calls the product "Muster".

- gs-common: `connectorIconOf`, the check a connector's icon passes before it
  goes into an `<img src>`, moves here from the muster plugin (which still
  exports it), and `serverInfoIconOf` picks an icon it accepts from an MCP
  `initialize` result's `serverInfo.icons`: the first without a `theme`, else
  the first of all.
- gs-node: `MusterMcpClient.serverIcon` reads that icon off the caller's
  cached muster session; it opens no connection of its own where one is open.
- muster-backend: `GET /server-info` answers `{ icon }`, muster's logo from its
  `initialize` result (muster v5.59.0 or later), as the person. A muster that
  announces none answers `{}`; one that cannot be asked answers
  `{ unavailable: true }`, both with HTTP 200. A token that is missing,
  expired or refused by muster answers 401.
- muster: `MusterApi.getServerInfo`, the hook `useMusterIcon`, and
  `useConnectorIcon`, the one rule for a connector's logo (muster's own, a
  server's `.status.icon`, a family's representative's). muster's row in the
  Connectors list and its page's header show the logo as an image, and the
  letter tile where there is none; an answer muster could not give is asked
  again within half a minute. The entry's name reads "Muster"
  (`MUSTER_DISPLAY_NAME`), and the plugin's copy calls the product "Muster";
  URLs, links, query keys and server names keep `muster`.
