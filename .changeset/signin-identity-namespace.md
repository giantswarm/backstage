---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

A person who signs in through a Dex connector other than `giantswarm-ad`, `giantswarm-github`, `giantswarm-simple-oidc` and `giantswarm-graveler-oidc`, or through an issuer without `federated_claims`, resolves to `user:oidc/<name>` from a hash of the `sub` of the token instead of `user:default/<email local part>`. A token without a `sub` is refused. `giantswarm-simple-oidc` and `giantswarm-graveler-oidc` sign-ins are looked up in the catalog by email, like `giantswarm-ad`. A Giant Swarm connector sign-in that matches no catalog user signs in as `user:default/guest`.
