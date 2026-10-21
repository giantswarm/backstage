---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

A connector tool's page (`…/connectors/<installation>/<connector>/tools/<tool>`)
is split into tabs, in the workflow page's order:

- **Overview** (the bare address): what the tool is for, the connector that
  offers it, the name muster exposes it as, what its connector declares in the
  MCP annotations, and its input schema, folded.
- **Run it** (`…/run`): the argument form, Run with its note and the result.
  While a run is in flight, leaving the tab asks first, as on a workflow's
  Run it.
- **Usage** (`…/usage`): every caller's calls to this one tool over the last
  30 days: tool calls, error ratio, p95 latency, calls per day by outcome and,
  for a family, each instance's figures, with a link to the connector's Usage
  tab. muster's own tools have none.

The "Usage in the last 30 days" section leaves the page's body for the Usage
tab. Any other address under the tool's redirects to Overview, keeping its
query, and the connector's Usage tab links each tool to the tool's Usage tab.

The muster backend's `/usage` takes `?tool=` (once) to narrow every figure to
one tool, alone or beside `?server=`.
