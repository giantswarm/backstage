import { createHash } from 'node:crypto';
import { NotAllowedError } from '@backstage/errors';
import {
  AuthResolverContext,
  OAuthAuthenticatorResult,
  SignInResolver,
} from '@backstage/plugin-auth-node';
import { OidcAuthResult } from '@backstage/plugin-auth-backend-module-oidc-provider';

type IdPClaim = {
  connector_id?: unknown;
};

/**
 * Dex connectors whose people are Giant Swarm staff in the catalog.
 * `giantswarm-simple-oidc` and `giantswarm-graveler-oidc` federate to the Dex
 * of gazelle and graveler, which sign staff in through `giantswarm-ad` and
 * `giantswarm-github` and pass on their email.
 */
const GIANT_SWARM_CONNECTORS = new Set([
  'giantswarm-ad',
  'giantswarm-github',
  'giantswarm-simple-oidc',
  'giantswarm-graveler-oidc',
]);

/** Namespace of every identity that is not looked up in the catalog. */
const EXTERNAL_NAMESPACE = 'oidc';

/**
 * The entity name of a token subject. Hashing keeps any subject a valid
 * entity name and keeps subjects that differ only in case apart under the
 * case-insensitive comparison of entity refs.
 */
function subjectName(subject: string): string {
  return createHash('sha256').update(subject).digest('hex').slice(0, 40);
}

function signInWithGuestUser(ctx: AuthResolverContext) {
  const guestUserRef = 'user:default/guest';

  return ctx.issueToken({
    claims: {
      sub: guestUserRef,
      ent: [guestUserRef],
    },
  });
}

/**
 * Maps an OIDC identity onto a Backstage user.
 *
 * Identities from the Giant Swarm Dex connectors are looked up in the catalog,
 * whose users live in the `default` namespace. Every other identity resolves
 * to `user:oidc/<name>` from the token's `sub`, which the issuer keeps unique
 * (Dex encodes the connector and upstream user id into it). Such users have
 * no catalog entity and never resolve into `default`; a token without a `sub`
 * is refused.
 */
export const customSignInResolver: SignInResolver<
  OAuthAuthenticatorResult<OidcAuthResult>
> = async (info, ctx) => {
  const userInfo = info.result.fullProfile.userinfo;

  const idpClaim = userInfo.federated_claims as IdPClaim | undefined;
  const connectorId = idpClaim?.connector_id;

  if (
    typeof connectorId === 'string' &&
    GIANT_SWARM_CONNECTORS.has(connectorId)
  ) {
    return signInGiantSwarmUser(connectorId, userInfo, ctx);
  }

  if (typeof userInfo.sub !== 'string' || userInfo.sub === '') {
    throw new NotAllowedError('The identity token names no subject');
  }
  const userRef = `user:${EXTERNAL_NAMESPACE}/${subjectName(userInfo.sub)}`;

  return ctx.issueToken({
    claims: {
      sub: userRef,
      ent: [userRef],
    },
  });
};

async function signInGiantSwarmUser(
  connectorId: string,
  userInfo: OidcAuthResult['userinfo'],
  ctx: AuthResolverContext,
) {
  const [field, value] =
    connectorId === 'giantswarm-github'
      ? ['metadata.name', userInfo.preferred_username]
      : ['spec.profile.email', userInfo.email];
  if (!value) {
    return signInWithGuestUser(ctx);
  }

  try {
    return await ctx.signInWithCatalogUser({ filter: { [field]: value } });
  } catch (err) {
    return signInWithGuestUser(ctx);
  }
}
