---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Add an "MCP usage" tab to the muster section (`/agent-platform/muster/usage`),
showing tool-call volume, outcomes, latency, and top tools/servers for the
selected installation.

- The muster-backend gains a `GET /usage` route that derives the statistics
  from muster's downstream dispatch metrics
  (`muster_downstream_tool_calls_total` /
  `muster_downstream_tool_call_duration_seconds`, shipped with muster ≥ the
  release carrying giantswarm/muster#1116). The PromQL queries run through
  the prometheus MCP server federated behind the same muster installation —
  no separate Prometheus access path or proxy config is needed.
- The prometheus server is discovered by the `<installation>-mcp-prometheus`
  naming convention (falling back to the only prometheus-ish server); the new
  optional `muster.installations[].prometheusServer` config overrides it.
- Installations without a queryable prometheus server render a friendly
  empty state instead of an error, as do installations whose muster does not
  export the downstream metrics yet.
