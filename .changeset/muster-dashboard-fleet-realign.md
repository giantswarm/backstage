---
'@giantswarm/backstage-plugin-muster': minor
---

Realign the muster dashboard fleet health and stop treating `Auth Required` as a degraded state.

- `mcpServerStateSeverity` now maps the CRD `Auth Required` state to healthy instead of a warning: it means the server needs a user session, which the browsing user already has, so rendering it amber was a false degraded signal. The real per-user auth gap still surfaces via the tool explorer's `servers_requiring_auth` affordance. The dashboard stat is relabelled "Servers healthy" and no longer counts `Auth Required` against the fleet.
- The dashboard "Fleet health" section is realigned from an MC × family grid to a server-grouped summary mirroring the MCP-servers manager: each standard family and integration server gets a row carrying a health pill per management cluster it is federated across. The per-MC pill pattern (`presenceByMc` + `InstallationHealthPill`) and the standard/integration partition (`partitionServers`) are extracted to shared modules so the manager and the dashboard group the fleet identically.
