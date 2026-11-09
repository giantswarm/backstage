---
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
---

muster's own entry among the connectors shows the logo muster announces and
reads "Muster".

- gs-common: `connectorIconOf`, the check a connector's icon passes before it
  goes into an `<img src>`, moves here from the muster plugin (which still
  exports it), and `serverInfoIconOf` picks the first icon it accepts from an
  MCP `initialize` result's `serverInfo.icons`.
- gs-node: `MusterMcpClient.serverIcon` reads that icon off the caller's
  cached muster session; it opens no connection of its own where one is open.
- muster-backend: `GET /server-info` answers `{ icon }`, muster's logo from its
  `initialize` result (muster v5.59.0 or later), as the person. A muster that
  announces none, or that cannot be asked, answers `{}` with HTTP 200; a
  missing or expired token answers 401.
- muster: `MusterApi.getServerInfo` and the hook `useMusterIcon`. muster's row
  in the Connectors list and its page's header show the logo as an image,
  and the letter tile where there is none. The entry's name reads "Muster"
  (`MUSTER_DISPLAY_NAME`); its URL, links and query keys keep `muster`.
