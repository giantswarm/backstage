---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
'@giantswarm/backstage-plugin-ai-chat': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs': patch
---

Let AI chat and the muster management UI present a muster-signed token to `/mcp` instead of the raw main Dex ID token, so muster's outbound token exchange accepts them.

- `auth-backend-module-gs` gains an authenticated `POST /api/auth/muster-token` route. It takes the user's main Dex ID token from the `gs-subject-token` header and mints a muster-signed session token via muster's self-issued RFC 8693 exchange (no `audience`, no client authentication), cached per user with expiry-aware re-exchange. The route is registered only when `gs.musterToken` is configured.
- `MCPAuthProviders` (ai-chat) and `MusterAuthProviders` (muster) call the new route when `gs.musterToken.tokenUrl` is set, using the muster-signed token as the MCP bearer and failing closed on error; without the config they keep forwarding the raw main Dex ID token.
- `gs` config gains `gs.musterToken.tokenUrl`.
