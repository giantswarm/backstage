---
'@giantswarm/backstage-plugin-repositories-backend': patch
'@giantswarm/backstage-plugin-repositories': patch
---

Honour a separate GitHub grant server for the Repositories page. New optional
config `repositories.muster.grantServer` names the muster MCPServer that holds
the GitHub grant giantswarm-repo-manager acts with. When set and the manager
answers "no GitHub grant", the backend replies 401 with that server's connect
URL so the page sends the person through GitHub's consent and back; when unset,
behaviour is unchanged. `GET /connection` additionally reports the grant
server's state when configured.
