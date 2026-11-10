---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

An installation whose muster the portal cannot reach no longer makes people wait. muster-backend answers a call to an installation its reachability probe found unreachable twice in a row at once with a 503, "not reachable from this portal", without a connection attempt or a warning; the probe allows a muster as long to answer as a call has to connect. gs-node exports `MUSTER_CONNECT_TIMEOUT_MS`, `ReachabilityCache` reports how many probes in a row failed (`failures`), and `MusterUnreachableError` names its `installation`. Connections to muster time out after 5 s instead of undici's 10 s, and the Agent Platform stops asking for the server list of such an installation, reading a list that answered 503 again only after a minute, then less and less often.
