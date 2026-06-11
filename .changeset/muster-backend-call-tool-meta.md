---
'@giantswarm/backstage-plugin-muster-backend': patch
---

Fixed the workflow endpoints failing with "tool not found" against real muster servers. The muster aggregator only exposes its meta-tools (`list_tools`, `call_tool`, ...) over MCP, so the proxy now invokes the core workflow tools through the `call_tool` meta-tool and unwraps its result envelope.
