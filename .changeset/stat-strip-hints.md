---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-bot-prs': patch
'@giantswarm/backstage-plugin-gs': patch
---

Explain every figure in the stats strips with an info hint: the session detail
and session usage totals, the muster dashboard, MCP usage and workflow run
stats, and the bot PR queue. The workload details pane's replica counts now use
the shared `Stat` component too, and the session detail and muster dashboard
strips use the same spacing as the others.
