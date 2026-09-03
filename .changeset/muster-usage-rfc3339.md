---
'@giantswarm/backstage-plugin-muster-backend': patch
---

Send RFC3339 timestamps to the prometheus range-query tool in the MCP usage
route — deployed mcp-prometheus versions reject Unix seconds despite the
tool schema documenting them, which broke the usage view with an
"invalid start time" error.
