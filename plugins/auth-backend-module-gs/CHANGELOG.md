# @giantswarm/backstage-plugin-auth-backend-module-gs

## 0.16.0

### Minor Changes

- a1292a5: The login page signs in through the main OIDC login provider only; the
  `gs.signInProviders` list and its GitHub-provider card are gone. Which Dex
  connector a sign-in lands on is now a deployment choice: the provider's
  `startUrlSearchParams.connector_id` pins the default connector, and
  `gs.signInFallbackProvider` adds a second card that signs in through the same
  provider pinned to another connector (for people the default one cannot
  authenticate). The Giant Swarm OIDC authenticator forwards a `connector_id`
  passed on `/start` to Dex for that request; `gsFallbackSignInAuthApiRef`
  exposes the fallback sign-in API.
- 8967f50: Backstage's standard GitHub auth API (`githubAuthApiRef`) runs on the person's own
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

### Patch Changes

- 9c3a9c4: Retry OIDC issuer metadata discovery for the main login provider, fail backend
  startup if it stays unreachable, and stop caching a failed discovery for the
  lifetime of the process.

  Previously a transient Dex outage during backend startup made the module skip
  registering the main login provider entirely: the portal came up healthy but
  every login returned `404 Unknown auth provider` until the pod was manually
  restarted.

  - Metadata discovery is now checked at startup through openid-client's
    `Issuer.discover` — the same code path and validation the oidc authenticator
    uses, bounded by its built-in HTTP timeout — and retried with exponential
    backoff (5 attempts over ~15s). If the issuer is still unreachable the
    module throws so the backend exits and the orchestrator restarts it until
    Dex is reachable again — the portal self-heals instead of silently serving
    without login. A malformed `metadataUrl` fails immediately without retries.
  - The registered provider now uses `gsOidcAuthenticator`, a wrapper around the
    upstream oidc authenticator that memoizes issuer discovery only on success.
    If Dex becomes unreachable after startup, each login attempt triggers a
    fresh discovery instead of the upstream behaviour of caching the first
    rejection until the process restarts.
  - Note on scope: configuration errors for the main login provider (missing
    environment block or `metadataUrl`) now also fail startup instead of
    starting the portal without login — broken required-login config should be
    loud.

- 0a10f54: Refuse to refresh an OIDC session with fewer scopes than the refresh asks for.

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

- 9fd228e: Cluster access: a token broker that answers 503 (`temporarily_unavailable`, `service_unavailable` or an empty body) is reported as `broker_unavailable` -- "Token broker is briefly unavailable" in the cluster-access status -- and logged as `Cluster token exchange failed: token broker temporarily unavailable`, apart from the broker's genuine rejections (`exchange_failed`). A broker outage hits every installation at once and clears by itself; it was reported as a rejected exchange for each of them.
- e9a6141: Sign in a user by the email of the token when it carries no `federated_claims`. The claim is Dex-specific, and reading it unconditionally made every login against another issuer fail with a `TypeError` in the sign-in resolver.
- Updated dependencies [71317f9]
- Updated dependencies [85e7d8c]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [5851bba]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
  - @giantswarm/backstage-plugin-gs-node@0.4.0

## 0.15.0

### Minor Changes

- 865790a: Make broker-backed cluster auth broker-only and surface per-cluster access health in the sidebar.

  Broker-covered kubernetes providers no longer fall back to the cookie `/refresh` or open per-cluster login popups: `createSession`/`refreshSession` mint silently through the muster token broker and, on failure, throw a typed `ClusterTokenError` carrying the installation and a coarse `reason`. The auth backend's cluster-token route now returns that `reason` (`broker_unreachable`, `exchange_failed`, `subject_invalid`) alongside the error. When the main Dex session is gone the connector triggers the single main SSO login automatically (the only popup a broker-backed cluster ever causes).

  A new in-memory `ClusterAccessStatusApi` records per-installation access outcomes (healthy / degraded / session-expired), fed by both the broker token flow and the clusters list, and rendered by a `ClusterAccessStatusSidebarItem` connection-status element with a "Sign in again" action when the main session has expired.

  The clusters list now loads fleet-wide fail-fast: API discovery and list queries are enabled per cluster as each one settles, the k8s proxy bounds each request with a configurable timeout (`gs.kubernetes.proxyTimeoutMs`, default 10s), and the table renders as soon as the first installation resolves instead of freezing on a single unreachable management cluster.

## 0.14.0

### Minor Changes

- 5b7e7ba: Mint per-management-cluster tokens silently through the muster token broker instead of per-cluster OAuth popups. The auth backend module gains an authenticated `POST /api/auth/cluster-token/:installation` route that exchanges the user's main Dex ID token (forwarded in the `gs-subject-token` header) for a short-lived cluster token via RFC 8693 token exchange against the broker configured in `gs.clusterTokenBroker`, cached per (user, installation) with expiry-aware re-exchange. The frontend kubernetes auth connectors try this silent path in `refreshSession` before the cookie-based refresh, so broker-covered clusters never open a login popup; the legacy popup remains as fallback when the broker is unreachable or a cluster is not migrated. Installations marked with `gs.installations.<name>.clusterTokenAudience` are considered fully covered and their entries disappear from the provider settings page, collapsing it to the single main login.

## 0.13.2

### Patch Changes

- fae2d2d: Add RFC 8707 resource indicator support to the MCP OAuth2 authenticator. When a `resource` option is configured on an `mcp-*` auth provider, it is sent in both the authorization request and every token request (including refresh grants), so the authorization server issues access tokens audience-bound to the target MCP server. This is required by the MCP authorization specification and by JWT-validating gateways in front of MCP servers (e.g. agentgateway), which reject tokens without the expected `aud` claim.

  Example configuration:

  ```yaml
  auth:
    providers:
      mcp-muster:
        production:
          clientId: ...
          authorizationUrl: ...
          tokenUrl: ...
          resource: https://muster.example.com/mcp
  ```

## 0.13.1

### Patch Changes

- 7fbbfff: Enable OAuth2 scope persistence to fix repeated token refresh on every request after token expiry.

## 0.13.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.12.0

### Minor Changes

- a68a2b2: Add OAuth2 PKCE authentication support for MCP servers
  - Add custom OAuth2 authenticator with PKCE (Proof Key for Code Exchange) support for secure public client authentication
  - Add CIMD (Client ID Metadata Document) router to serve OAuth client metadata for MCP server authorization flows
  - Register MCP auth providers (prefixed with `mcp-`) in the backend auth module
  - Add `MCPAuthProviders` API in ai-chat plugin to fetch credentials for configured MCP auth providers
  - Update AI Chat page to automatically inject MCP auth tokens into request headers
  - Refactor `GSAuthProviders` to separate Kubernetes and MCP auth providers with dedicated methods

## 0.11.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

## 0.10.2

### Patch Changes

- b0650cd: Removed custom OIDC provider implementation.

## 0.10.1

### Patch Changes

- df8b489: Changed gs-auth-module to use node-fetch package.

## 0.10.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

## 0.9.0

### Minor Changes

- 03e8bfc: Changed Dex sign-in resolver to use username from email as user reference when it's available.

## 0.8.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

## 0.7.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.

## 0.6.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

## 0.5.1

### Patch Changes

- 5939854: Fix GS auth provider sign-in resolver to correctly handle Azure AD IdP.

## 0.5.0

### Minor Changes

- 3d05628: Use Dex authentication provider for user sign-in.

## 0.4.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

## 0.3.0

### Minor Changes

- 06092e9: Change GS auth backend module to support client side OIDC provider.
- f508faf: Update Backstage packages to v1.32.5.

### Patch Changes

- 06092e9: Move custom GitHub auth provider from GS backend module to backend package.

## 0.2.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.
