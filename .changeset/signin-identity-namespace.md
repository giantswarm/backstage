---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

A person who signs in through a Dex connector other than `giantswarm-ad` and `giantswarm-github` resolves to `user:dex-<connector id>/<upstream user id>`, and a person from an issuer without `federated_claims` to `user:oidc/<sub>`, instead of `user:default/<email local part>`. A connector or user id that is not a plain lowercase name maps to a hash. A token without those claims is refused. Giant Swarm connector sign-ins are unchanged.
