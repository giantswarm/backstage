---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-roadmap': patch
'app': minor
---

Backstage's standard GitHub auth API (`githubAuthApiRef`) runs on the person's own
GitHub grant in muster when `gs.github` is configured -- no GitHub App and no GitHub
login in the portal. The GitHub Actions and Pull Requests tabs, `ScmAuth` and the
scaffolder pickers work unchanged with their own GitHub clients; only the token
source changed.

- `plugins/gs`: `GSAuthProviders.getGithubAuthApi()` builds `OAuth2` over a
  `GithubGrantAuthConnector` that mints from `POST /api/auth/github-token` with the
  Backstage token and the main Dex ID token, echoes the requested scopes as granted
  (a GitHub App user token carries none) and sets `expiresAt` from the token's
  remaining lifetime, so the session re-mints three minutes before it ends while
  muster refreshes the grant underneath. A person without a grant is sent through
  muster's connect once -- a full-page bounce with `redirect=<current page>` that
  GitHub answers without a prompt for the App already authorized at the Dex login
  -- never the "Login Required" dialog; a bounce that comes back without a grant is
  not repeated. Signing out (`removeSession`) revokes the grant in muster for every
  session and every server of that issuer. `gs.github.brokerAudience` (frontend
  visible) switches the API on; `gs.github.muster` names the installation and
  MCPServer.
- `plugins/auth-backend-module-gs`: `POST /api/auth/github-token` exchanges the
  caller's Dex ID token through the muster token broker (`gs.clusterTokenBroker`
  credentials, RFC 8693, audience `gs.github.brokerAudience`) for the grant's access
  token, cached per user with 240 s skew; `invalid_target` is disambiguated through
  muster's `core_auth_login` on `gs.github.muster`: a connect that succeeds retries
  the exchange, `auth_required` answers 401 with `reason: no_grant` and muster's
  connect URL, anything else is 502 like the cluster-token route.
  `POST /api/auth/github-token/logout` runs `core_auth_logout`.
- `plugins/gs-node`: `MusterServerGateway.logout()` (`core_auth_logout`).
- `packages/app`: the `github-auth` factory uses the GS API when `gs.github` is
  configured and upstream `GithubAuth.create` otherwise; customer portals are
  unchanged.
- `plans`, `roadmap`: a missing GitHub grant bounces the page through muster's connect
  on its own instead of showing a "Connect GitHub" button and polling a popup; the
  button remains as the fallback when a bounce comes back without a grant.
