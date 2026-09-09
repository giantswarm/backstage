---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

Refuse to refresh an OIDC session with fewer scopes than the refresh asks for.

A token refresh never widens a grant: Dex re-issues the tokens with the scopes
the sign-in consented to. When `gs.auth.extraScopes` gained a scope on a running
instance (for example the `audience:server:client_id:dex-k8s-authenticator`
audience the Giant Swarm apiservers require), the frontend refreshed with the
wider set, the backend answered with a token that still lacked the new scopes
and reported the requested set as granted, and every Kubernetes proxy read
failed with `401` until the person signed out by hand.

The Giant Swarm OIDC authenticator now fails such a refresh (the OAuth adapter
already knows, from the persisted granted-scope cookie, that the request exceeds
the grant). The frontend's session manager drops the session and starts a fresh
sign-in that asks for the widened set, so a widened `gs.auth.extraScopes` makes
existing sessions re-authenticate on their next page load. The config schema and
`docs/configuration.md` say so.
