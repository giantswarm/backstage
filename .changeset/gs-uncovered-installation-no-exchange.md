---
'@giantswarm/backstage-plugin-gs': patch
---

An installation the token broker does not cover is no longer exchanged at
muster. With `gs.clusterTokenBroker.tokenUrl` set, the portal minted a cluster
token through muster for every installation but the main one, including those
without `clusterTokenAudience`, which muster can only refuse with
`invalid_target`: a warning in the backend log and in Sentry on every access,
and a degraded cluster in the sidebar. Only a covered installation
(`clusterTokenAudience`, or a Dex target) takes the silent broker path now; an
uncovered one keeps its own entry on the provider settings page, as it already
did. An `invalid_target` for a covered installation is a registration gap in
muster and still logs at `warn`.
