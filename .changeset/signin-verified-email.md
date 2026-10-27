---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

A Giant Swarm connector sign-in is looked up in the catalog by email only when the token asserts `email_verified: true`; an unverified email signs in as `user:default/guest`, like a token without one.
