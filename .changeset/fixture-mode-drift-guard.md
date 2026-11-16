---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

In fixture mode, muster answers the New connector flow's transport probe (`core_mcpserver_detect`) and definition check (`core_mcpserver_validate`). A unit test in each plugin fails when a tool the plugin calls through muster has no fixture handler and is not listed as not served.
