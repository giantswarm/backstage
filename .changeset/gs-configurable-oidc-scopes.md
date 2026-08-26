---
'@giantswarm/backstage-plugin-gs': minor
---

Make the extra OIDC scopes of the Giant Swarm login providers configurable, so the portal can run against an issuer other than Dex.

Every provider still requests `openid profile email groups offline_access`. The scopes on top of that come from the new optional `gs.auth.extraScopes`, which defaults to today's list: the cross-client `audience:server:client_id:dex-k8s-authenticator` scope, plus `federated:id` for the cluster-access providers. A deployment on Keycloak or Entra ID must set `gs.auth.extraScopes: []`, because those issuers reject the Dex-specific scopes with `invalid_scope` before showing a login page.
