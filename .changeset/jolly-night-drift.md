---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Add a "Usage" tab to the Agent Platform section (`/agent-platform/usage`),
showing your own agent usage over the last 30 days alongside the installation's
MCP tool calls.

- The personal section reports sessions, turns, input and output tokens and tool
  calls, two per-day token charts, breakdowns per agent and per model, and your
  top tools and MCP servers. The per-model breakdown is derived from each
  agent's ModelConfig, so it reflects the model an agent runs on _now_ — kagent
  records none per session — and the table says so. Every number is **your own**: kagent scopes its session list to
  the caller, and on an installation running kagent in `unsecure` mode — where
  the list is everyone's — the page's copy switches rather than claiming
  ownership it cannot support.
- A new `GET /api/agent-platform/kagent/session-usage` derives it. kagent stores
  no usage summary of any kind, so the route reads each session's conversation
  and totals it server-side, bounded by `agentPlatform.kagent.sessionUsage.*`
  (window, session cap, concurrency, timeouts, budget, cache TTL). It answers a
  partial summary with `skipped`/`unreadable` set rather than failing, and the
  page says so.
- The MCP usage view **moves** off muster's own tab strip into this page as a
  clearly-scoped second section, contributed as an extension so neither plugin
  depends on the other. `/agent-platform/muster/usage` redirects, and muster's
  Dashboard card retargets. Its 24h/7d/30d switcher is gone: one window for the
  whole page, so the two sections stay comparable.
- `Stat` and the tone palette move to `ui-react` (three copies existed), and
  `StackedBarChart` gains optional `formatYAxisTick`, `yAxisWidth` and
  `formatValue` so it can carry seven-digit token values. The session detail
  page's stat labels therefore render uppercase, and its longest label shortens
  to "Input tokens (billed)".
- No cost, tokens/second or context-window figures: kagent records none at any
  version, including v0.10.
