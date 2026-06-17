# @giantswarm/backstage-plugin-auth-backend-module-gs

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
