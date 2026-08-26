---
'@giantswarm/backstage-plugin-gs': minor
---

Make the extra OIDC scopes of the Giant Swarm login providers configurable, so the portal can run against an issuer other than Dex.

Every provider still requests `openid profile email groups offline_access`. The scopes on top of that come from the new optional `gs.auth.extraScopes`. Unset, it keeps the Dex defaults: `audience:server:client_id:dex-k8s-authenticator` for every provider, plus `federated:id` for all but the `mcp-*` providers. A deployment on Keycloak or Entra ID must set `gs.auth.extraScopes: []`, because those issuers reject both scopes with `invalid_scope` before showing a login page.
