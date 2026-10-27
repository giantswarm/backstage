---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

A person who signs in through a Dex connector other than the Giant Swarm ones, or through an issuer without `federated_claims`, resolves to `user:oidc/<name>` from a hash of the `sub` of the token instead of `user:default/<email local part>`. A token without a `sub` is refused. `giantswarm-simple-oidc` and `giantswarm-graveler-oidc` sign-ins are looked up in the catalog like a sign-in through the connector the person used on the Dex of gazelle or graveler: by email after `giantswarm-ad`, by GitHub login after `giantswarm-github`. After any other connector there, they resolve to `user:oidc/<name>`. A `giantswarm-github` sign-in without a username is looked up by email. A Giant Swarm connector sign-in that matches no catalog user signs in as `user:default/guest`.
