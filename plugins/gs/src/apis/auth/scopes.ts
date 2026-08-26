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
 * Assembles the scope list for a login provider: the base scopes plus the extra
 * scopes, in that order and without duplicates. `gs.auth.extraScopes` wins over
 * `defaultExtraScopes`.
 *
 * An empty `gs.auth.extraScopes` is a valid value and drops the extra scopes.
 * An issuer other than Dex needs it: the Dex-specific defaults make Keycloak
 * answer `invalid_scope` before it shows a login page.
 */
export function getOIDCScopes(
  configApi: ConfigApi | undefined,
  defaultExtraScopes: string[],
): string[] {
  const extraScopes =
    configApi?.getOptionalStringArray('gs.auth.extraScopes') ??
    defaultExtraScopes;

  return [...new Set([...BASE_SCOPES, ...extraScopes])];
}
