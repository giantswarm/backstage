---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
---

The login page can offer more than one sign-in option. `gs.signInProviders`
lists them in order — `dex` for the main OIDC login provider (`gs.authProvider`)
and `github` for the portal's `auth.providers.github` provider — each with an
optional card title and message. A single entry keeps today's automatic sign-in;
several show a chooser, and an existing session with any listed provider is
still picked up silently. Without the list nothing changes: the main provider
alone, titled via `gs.signInProvider`.
