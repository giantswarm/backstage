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
 * `gs.auth.scopes` replaces the base set entirely, for issuers that reject
 * scopes they don't know: Google accepts only `openid profile email` and
 * fails the whole authorization request on `groups`/`offline_access`
 * (Google models refresh via `access_type=offline`, not a scope).
 *
 * An issuer-specific scope has no default here and must come from the
 * deployment: a Dex deployment needs `federated:id`, which carries the
 * `federated_claims` the sign-in resolver maps onto a catalog entity, and the
 * cross-client `audience:server:client_id:<client>` scope for every client
 * whose audience a forwarded token must satisfy.
 */
export function getOIDCScopes(configApi?: ConfigApi): string[] {
  const baseScopes =
    configApi?.getOptionalStringArray('gs.auth.scopes') ?? BASE_SCOPES;
  const extraScopes =
    configApi?.getOptionalStringArray('gs.auth.extraScopes') ?? [];

  return [...new Set([...baseScopes, ...extraScopes])];
}
