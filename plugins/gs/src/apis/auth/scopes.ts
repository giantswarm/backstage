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
 * Extra scopes requested when `gs.auth.extraScopes` is unset. Both are
 * Dex-specific:
 *
 * - `federated:id` adds the `federated_claims` the main sign-in resolver reads
 *   to map a user onto a catalog entity.
 * - `audience:server:client_id:dex-k8s-authenticator` is a cross-client scope
 *   that makes Dex issue a token the `dex-k8s-authenticator` client also
 *   accepts. It needs that client to list the requesting client in its
 *   `trustedPeers`.
 *
 * An issuer other than Dex rejects both. Keycloak answers `invalid_scope` and
 * shows no login page, so it needs `gs.auth.extraScopes: []`.
 */
const DEFAULT_EXTRA_SCOPES = [
  'federated:id',
  'audience:server:client_id:dex-k8s-authenticator',
] as const;

/**
 * Assembles the scope list for a login provider: the base scopes plus the extra
 * scopes, in that order and without duplicates. An empty `gs.auth.extraScopes`
 * is a valid value and drops the extra scopes.
 */
export function getOIDCScopes(configApi?: ConfigApi): string[] {
  const extraScopes =
    configApi?.getOptionalStringArray('gs.auth.extraScopes') ??
    DEFAULT_EXTRA_SCOPES;

  return [...new Set([...BASE_SCOPES, ...extraScopes])];
}
