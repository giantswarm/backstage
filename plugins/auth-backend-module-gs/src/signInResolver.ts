import { NotAllowedError } from '@backstage/errors';
import {
  OAuthAuthenticatorResult,
  SignInResolver,
} from '@backstage/plugin-auth-node';
import { OidcAuthResult } from '@backstage/plugin-auth-backend-module-oidc-provider';
import { oidcIdentity } from '@giantswarm/backstage-plugin-gs-node';

/**
 * Maps an OIDC identity onto a Backstage user, by `oidcIdentity` (gs-node),
 * which the muster backend applies too to tell whether a forwarded token is
 * the signed-in person's.
 *
 * Identities from the Giant Swarm Dex connectors, directly or through the Dex
 * of gazelle and graveler, are looked up in the catalog, whose users live in
 * the `default` namespace; one the catalog cannot match is refused. Every
 * other identity resolves to `user:oidc/<name>` from the token's `sub`, which
 * the issuer keeps unique (Dex encodes the connector and upstream user id
 * into it). Such users have no catalog entity and never resolve into
 * `default`; a token without a `sub` is refused.
 */
export const customSignInResolver: SignInResolver<
  OAuthAuthenticatorResult<OidcAuthResult>
> = async (info, ctx) => {
  const identity = oidcIdentity(
    info.result.fullProfile.userinfo as Record<string, unknown>,
  );
  switch (identity.kind) {
    case 'catalog':
      return ctx.signInWithCatalogUser({
        filter: { [identity.field]: identity.value },
      });
    case 'external':
      return ctx.issueToken({
        claims: {
          sub: identity.userEntityRef,
          ent: [identity.userEntityRef],
        },
      });
    default:
      throw new NotAllowedError(identity.reason);
  }
};
