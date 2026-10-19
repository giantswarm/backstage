---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

A connector's page gains a **Usage** tab (`…/usage`): every caller's tool
calls to the connector over the last 30 days, from muster's dispatch metrics.
It shows tool calls, error ratio (amber above 5%), p95 latency and how many of
the connector's tools were called, calls per day by outcome, every tool it
offers with its calls, errors and p95 (tools never called included), and for a
family each instance's figures. It links to Usage → Connectors. muster's own
page has none, since muster's own tools are not counted under a connector.

A tool's page shows the tool's calls, errors and p95 latency over the same 30
days, and the Details tab's "Calls this month" becomes "Calls, last 30 days":
all three read one request, so their numbers agree.

The muster backend's `/usage` takes `?server=` (repeatable) to narrow every
figure to those MCPServers, and then lists every tool they were called with
instead of the busiest 15. Each connector row carries its `p95_seconds`. Where
the records start (`data_start`) stays the installation's. `window=month`,
which only the Details fact used, is gone.

The muster plugin's external route `usageConnectors` is bound by the app to
agent-platform's Usage → Connectors.
