---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

A connector's page has a Details tab in place of its facts column: sign-in,
health, calls this month and when it was added, then a Technical details
fold-out, as on the agent and model pages, with the GitOps source and the
release that applies the MCPServer, the configuration with its address, the
auth chain and muster's health detail. The fold-out opens on arrival while the
connector has failed. `TechnicalDetailsFoldOut` moves from the agent-platform
plugin to `ui-react`.
