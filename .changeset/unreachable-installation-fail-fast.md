---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

An installation whose muster the portal cannot reach no longer makes people wait. muster-backend answers a call to an installation its reachability probe reports unreachable at once with a 503, "not reachable from this portal", without a connection attempt or a warning. Connections to muster time out after 5 s instead of undici's 10 s (`createMusterFetch`, `MUSTER_CONNECT_TIMEOUT_MS` in gs-node), and the Agent Platform stops asking for the server list of such an installation, reading a list that answered 503 again only after a minute, then less and less often.
