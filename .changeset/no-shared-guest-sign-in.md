---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

A sign-in through a Giant Swarm Dex connector that matches no catalog user, or whose token carries neither a username nor a verified email, is refused instead of signing in as the shared `user:default/guest`. A failed catalog lookup refuses the sign-in too.
