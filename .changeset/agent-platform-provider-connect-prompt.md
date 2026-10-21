---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

The workspace provider sign-in is one `ProviderConnectPrompt`, used inline by
the workspace editor and by the composer's workspace start: it starts the
grant of each provider instance's own App in muster (`core_auth_login
app=<instance>`), or the server the workspace-manager is pinned to, in a new
tab, reads `list_providers` again when the person comes back, and tells its
host once the instance reads connected, with the host's draft or prompt kept.
Several provider instances, of any kind, connect independently; the composer
starts the session once every one it asked for is connected. muster's
`/auth/login` and `/auth/logout` take `{ app }` in place of `{ server }`, and
`useServerSignIn` signs in to a provider App with `{ app: true }`.
