---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Agent avatars load through the agent-platform backend
(`/api/agent-platform/avatars/<installation>/v1/...`) instead of from each
installation's `avatars.<baseDomain>` host, so they are same-origin `<img>`
loads and the Content-Security-Policy needs no per-installation `img-src`
entry any more — that allowlist named every installation's base domain in a
header sent with the unauthenticated page. `backend.csp.img-src` overrides
that only existed to list avatar hosts can go.

The Agents and Sessions tabs issue and refresh the backend's user cookie
(`CookieAuthRefreshProvider`), which is what authenticates an `<img>` load.
`useAgentAvatarUrl` builds the proxied URL; the canonical URL an agent's
resource records as its `iconUrl` moves to `useAgentIconUrl` and is unchanged.
