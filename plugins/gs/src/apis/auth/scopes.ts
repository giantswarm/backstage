import { ConfigApi } from '@backstage/core-plugin-api';

/**
 * Scopes every Giant Swarm OIDC provider requests. Standard OIDC, plus
 * `groups`, which the group-based access checks need.
 */
const BASE_SCOPES = [
  'openid',
  'profile',
  'email',
  'groups',
  'offline_access',
] as const;

/**
 * A cross-client scope that makes Dex issue a token the
 * `dex-k8s-authenticator` client also accepts. It needs that client to list
 * the requesting client in its `trustedPeers`.
 */
const DEX_AUDIENCE_SCOPE = 'audience:server:client_id:dex-k8s-authenticator';

/**
 * Adds the `federated_claims` the main sign-in resolver reads to map a user
 * onto a catalog entity. Dex accepts it from any client.
 */
const DEX_FEDERATED_ID_SCOPE = 'federated:id';

/**
 * Extra scopes requested when `gs.auth.extraScopes` is unset, per kind of
 * provider. Both defaults are Dex-specific, and an issuer other than Dex
 * rejects them: Keycloak answers `invalid_scope` and shows no login page, so it
 * needs `gs.auth.extraScopes: []`.
 *
 * The `mcp-*` providers authenticate against the authorization server of an MCP
 * server, which forwards a requested scope upstream unchanged. They get no
 * `federated:id`, because nothing reads `federated_claims` from their token and
 * an upstream that validates scopes strictly would reject it.
 */
const DEFAULT_EXTRA_SCOPES = {
  kubernetes: [DEX_FEDERATED_ID_SCOPE, DEX_AUDIENCE_SCOPE],
  mcp: [DEX_AUDIENCE_SCOPE],
} as const;

/** The kinds of login provider that request their own set of extra scopes. */
export type OIDCProviderKind = keyof typeof DEFAULT_EXTRA_SCOPES;

/**
 * Assembles the scope list for a login provider: the base scopes plus the extra
 * scopes, in that order and without duplicates. `gs.auth.extraScopes` replaces
 * the defaults of every provider kind. An empty list is a valid value and drops
 * the extra scopes.
 */
export function getOIDCScopes(
  providerKind: OIDCProviderKind,
  configApi?: ConfigApi,
): string[] {
  const extraScopes =
    configApi?.getOptionalStringArray('gs.auth.extraScopes') ??
    DEFAULT_EXTRA_SCOPES[providerKind];

  return [...new Set([...BASE_SCOPES, ...extraScopes])];
}
