---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
---

Surface how muster identifies itself to a server's authorization server
during downstream sign-in (muster#1083).

- `muster-backend`: `parseAuthLoginResult` passes through
  `structuredContent.clientIdMethod` (`cimd` | `dcr` | `cimd-fallback`) from
  `core_auth_login` challenges; older musters that don't report it are
  unaffected.
- `muster`: the per-server Sign in affordance warns up front when the
  authorization server advertises neither CIMD support nor dynamic client
  registration (`cimd-fallback` — the sign-in may be rejected as an
  unregistered client, the Miro-style failure), and quietly notes when muster
  registered itself via RFC 7591 Dynamic Client Registration (`dcr`).
