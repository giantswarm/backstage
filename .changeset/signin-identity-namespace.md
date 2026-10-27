---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

A person who signs in through a Dex connector other than `giantswarm-ad` and `giantswarm-github`, or through an issuer without `federated_claims`, resolves to `user:oidc/<name>` from the `sub` of the token instead of `user:default/<email local part>`. A `sub` that is not a plain lowercase name maps to a hash. A token without a `sub` is refused. Giant Swarm connector sign-ins are unchanged.
