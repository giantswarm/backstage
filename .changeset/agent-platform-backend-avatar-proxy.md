---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

`GET /avatars/:installation/v1[/preview][/<size>]/<name>.png` serves an
agent's avatar fetched from that installation's `avatars.<baseDomain>`, so the
portal's `<img>` loads it same-origin. The browser used to load the avatar
hosts directly, which made every deployment allowlist them in the
Content-Security-Policy's `img-src` — a header sent with the unauthenticated
page, naming each installation's base domain to anyone who asks.

The installation must be a configured one with a base domain, the size one of
the endpoint's own and the name a DNS label; the upstream URL is rebuilt from
those parts alone and redirects are refused. `Content-Type`, `Cache-Control`
(the preview route's `no-store` included) and `ETag` are forwarded, a
conditional request revalidates through the proxy, and an upstream failure is
a 502 with the reason rather than an error report per image.

The path accepts the plugin's user cookie (`user-cookie` policy), because an
`<img>` carries no bearer token; the frontend issues and refreshes that cookie.
