---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

A connector's page has a Technical details fold-out below its tabs, as the
agent and model pages do: the GitOps source and the release that applies the
MCPServer, the configuration, the auth chain and muster's health detail. It
opens on arrival while the connector has failed. `TechnicalDetailsFoldOut`
moves from the agent-platform plugin to `ui-react`.
