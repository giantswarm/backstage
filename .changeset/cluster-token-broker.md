---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
'@giantswarm/backstage-plugin-gs': minor
---

Mint per-management-cluster tokens silently through the muster token broker instead of per-cluster OAuth popups. The auth backend module gains an authenticated `POST /api/auth/cluster-token/:installation` route that exchanges the user's main Dex ID token (forwarded in the `gs-subject-token` header) for a short-lived cluster token via RFC 8693 token exchange against the broker configured in `gs.clusterTokenBroker`, cached per (user, installation) with expiry-aware re-exchange. The frontend kubernetes auth connectors try this silent path in `refreshSession` before the cookie-based refresh, so broker-covered clusters never open a login popup; the legacy popup remains as fallback when the broker is unreachable or a cluster is not migrated. Installations marked with `gs.installations.<name>.clusterTokenAudience` are considered fully covered and their entries disappear from the provider settings page, collapsing it to the single main login.
