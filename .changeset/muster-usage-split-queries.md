---
'@giantswarm/backstage-plugin-muster-backend': patch
---

Derive every MCP-usage aggregate from step-split range queries instead of
instant queries with a range-long lookback, computing histogram quantiles
client-side. Mimir splits range queries into short subqueries but sends
`increase(x[24h])` instants to the long-range store path, which 500s when a
store-gateway degrades (observed live: `[1h]` fine, `[12h]`+ failing while
the equivalent range queries kept working). Secondary rollups (per-tool,
per-server, latency) now also degrade to empty instead of taking the whole
view down.
