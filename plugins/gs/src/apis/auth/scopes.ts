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
 * Assembles the scope list for a login provider: the base scopes plus
 * `gs.auth.extraScopes`, in that order and without duplicates.
 *
 * An issuer-specific scope has no default here and must come from the
 * deployment: a Dex deployment needs `federated:id`, which carries the
 * `federated_claims` the sign-in resolver maps onto a catalog entity, and the
 * cross-client `audience:server:client_id:<client>` scope for every client
 * whose audience a forwarded token must satisfy.
 */
export function getOIDCScopes(configApi?: ConfigApi): string[] {
  const extraScopes =
    configApi?.getOptionalStringArray('gs.auth.extraScopes') ?? [];

  return [...new Set([...BASE_SCOPES, ...extraScopes])];
}
