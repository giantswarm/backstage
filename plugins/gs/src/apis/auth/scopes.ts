import { ConfigApi } from '@backstage/core-plugin-api';

/**
 * Scopes every Giant Swarm OIDC provider requests. Standard OIDC, plus
 * `groups`, which the group-based access checks need.
 */
export const BASE_OIDC_SCOPES: readonly string[] = [
  'openid',
  'profile',
  'email',
  'groups',
  'offline_access',
];

/**
 * Extra scopes for a Kubernetes (cluster access) provider when the
 * configuration sets none. Both are Dex-specific: `federated:id` adds the
 * upstream connector identity, and the cross-client `audience:server:client_id:`
 * scope makes Dex issue a token that `dex-k8s-authenticator` also accepts.
 */
export const DEFAULT_KUBERNETES_EXTRA_SCOPES: readonly string[] = [
  'federated:id',
  'audience:server:client_id:dex-k8s-authenticator',
];

/**
 * Extra scopes for an MCP provider when the configuration sets none. Dex-specific,
 * see {@link DEFAULT_KUBERNETES_EXTRA_SCOPES}.
 */
export const DEFAULT_MCP_EXTRA_SCOPES: readonly string[] = [
  'audience:server:client_id:dex-k8s-authenticator',
];

/**
 * Assembles the scope list for one provider: the base scopes plus the extra
 * scopes, in that order and without duplicates.
 *
 * The extra scopes come from `gs.auth.providers.<providerName>.extraScopes`,
 * then `gs.auth.extraScopes`, then `defaultExtraScopes`. An empty array is a
 * valid value and drops the extra scopes: an issuer other than Dex rejects the
 * Dex-specific defaults (Keycloak answers `invalid_scope`).
 */
export function resolveOIDCScopes(options: {
  configApi?: ConfigApi;
  providerName: string;
  defaultExtraScopes: readonly string[];
}): string[] {
  const { configApi, providerName, defaultExtraScopes } = options;

  const authConfig = configApi?.getOptionalConfig('gs.auth');
  const extraScopes =
    authConfig
      ?.getOptionalConfig('providers')
      ?.getOptionalConfig(providerName)
      ?.getOptionalStringArray('extraScopes') ??
    authConfig?.getOptionalStringArray('extraScopes') ??
    defaultExtraScopes;

  return [...new Set([...BASE_OIDC_SCOPES, ...extraScopes])];
}
