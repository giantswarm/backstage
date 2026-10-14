---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Usage gives every metric one home. **Overview** shows platform health and headline trends: the tiles, tokens per day by type, top agents ranked by model calls, gateway health and the MCP tool-call section. It keeps one spend tile that links to Cost. **Cost** is the only view with money breakdowns: spend against the previous window, the blended $/1M rate, cache read share, cost per day, the by-agent and by-model tables, and the unpriced-models warning. **Your sessions** is unchanged. The **Technical details** view is removed because each of its figures moved to Overview or Cost; `/usage/technical` and `/usage/mcp` now redirect to Overview.
