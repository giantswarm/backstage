---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

A person who signs in through a Dex connector other than `giantswarm-ad`, `giantswarm-github`, `giantswarm-simple-oidc` and `giantswarm-graveler-oidc`, or through an issuer without `federated_claims`, resolves to `user:oidc/<name>` from the `sub` of the token instead of `user:default/<email local part>`. A `sub` that is not a plain lowercase name maps to a hash. A token without a `sub` is refused. `giantswarm-simple-oidc` and `giantswarm-graveler-oidc` sign-ins are looked up in the catalog by email, like `giantswarm-ad`.
