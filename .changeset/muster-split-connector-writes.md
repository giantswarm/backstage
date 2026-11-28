---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs-node': patch
---

A connector edit goes through muster's split writes (`core_mcpserver_connect` for the connection, `core_mcpserver_update` for the rest) where muster has them; muster-backend answers their refusals with 422.
