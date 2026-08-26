---
'@giantswarm/backstage-plugin-gs': minor
---

Drive the OIDC scopes of the Giant Swarm login providers from `gs.auth.extraScopes`, so the portal can run against an issuer other than Dex.

Every provider requests the fixed set `openid profile email groups offline_access`, plus whatever `gs.auth.extraScopes` lists. The Dex-specific `federated:id` and `audience:server:client_id:dex-k8s-authenticator` scopes are no longer compiled in and have no default.

A Dex deployment must set both explicitly:

```yaml
gs:
  auth:
    extraScopes:
      - federated:id
      - audience:server:client_id:dex-k8s-authenticator
```

Without `federated:id` the sign-in resolver falls back to the email of the token and the connector-based catalog lookups stop running. Without the cross-client audience scope, a service that trusts the `dex-k8s-authenticator` audience rejects the token the portal forwards to it, which takes the AI chat muster server and the Muster management UI with it. A deployment on Keycloak or Entra ID leaves the key unset.
