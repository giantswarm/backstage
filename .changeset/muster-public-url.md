---
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

`muster.installations[].publicUrl` names where an installation's muster serves its own pages (its `oauth.mcpClient.publicUrl`) when that is not on the host of its `url`, and `GET /api/muster/installations` reports it. The Agent Platform session page returns a person from muster's approval page and sign-in start by it, else by the endpoint's origin as before.
