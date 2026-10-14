---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Usage: the Overview gains an activity heatmap, and connector tool calls get
their own **Connectors** view.

- **Overview** now shows the headline tiles, model calls per day as a
  GitHub-style heatmap (with the busiest day, active days and daily average)
  beside the top agents, the gateway's health, and the tokens per day by type.
- **Connectors** (`/agent-platform/usage/connectors`) carries the connectors'
  tool calls that used to sit at the foot of Overview. It is offered only where
  the muster plugin contributes it, and the old `/agent-platform/usage/mcp`
  address now leads there.
- The daily model-call count behind the heatmap is one extra pair of Mimir
  queries, run only by the Overview; if it fails, the heatmap says so and the
  rest of the view is unaffected.
