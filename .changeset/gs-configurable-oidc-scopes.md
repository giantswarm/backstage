---
'@giantswarm/backstage-plugin-gs': minor
---

Make the extra OIDC scopes of the Giant Swarm login providers configurable, so the portal can run against an issuer other than Dex.

Every provider still requests `openid profile email groups offline_access`. The scopes on top of that come from the new optional `gs.auth.extraScopes`, which defaults to the Dex-specific `federated:id` and `audience:server:client_id:dex-k8s-authenticator`. A deployment on Keycloak or Entra ID must set `gs.auth.extraScopes: []`, because those issuers reject both with `invalid_scope` before showing a login page.

The `mcp-*` providers now request `federated:id` as well, which they did not before. Dex accepts it from any client, and the extra `federated_claims` it adds to their token is unused.
