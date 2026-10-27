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
  user_id?: unknown;
};

/** Dex connectors whose people are Giant Swarm staff in the catalog. */
const GIANT_SWARM_CONNECTORS = new Set(['giantswarm-ad', 'giantswarm-github']);

/**
 * Dex connectors that federate to the Dex of gazelle and graveler. Their
 * `user_id` is the `sub` of that Dex, which names the connector the person
 * signed in with there.
 */
const FEDERATING_CONNECTORS = new Set([
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

/**
 * The connector named by a Dex subject: the base64url encoding of the
 * protobuf message `IDTokenSubject { string user_id = 1; string conn_id = 2; }`.
 */
function dexSubjectConnector(subject: unknown): string | undefined {
  if (typeof subject !== 'string') {
    return undefined;
  }
  const bytes = Buffer.from(subject, 'base64url');
  let offset = 0;
  while (offset < bytes.length) {
    const tag = bytes[offset++];
    let length = 0;
    for (let shift = 0; ; shift += 7) {
      if (offset >= bytes.length || shift > 28) {
        return undefined;
      }
      const byte = bytes[offset++];
      length |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    if ((tag & 0x07) !== 2 || offset + length > bytes.length) {
      return undefined;
    }
    if (tag >> 3 === 2) {
      return bytes.toString('utf8', offset, offset + length);
    }
    offset += length;
  }
  return undefined;
}

/**
 * The token's email when the issuer has verified it. An unverified email
 * names nobody: it is whatever the upstream account claims.
 */
function verifiedEmail(
  userInfo: OidcAuthResult['userinfo'],
): string | undefined {
  return userInfo.email_verified === true ? userInfo.email : undefined;
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
 * Identities from the Giant Swarm Dex connectors, directly or through the Dex
 * of gazelle and graveler, are looked up in the catalog, whose users live in
 * the `default` namespace. Every other identity resolves
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
  const connectorId =
    typeof idpClaim?.connector_id === 'string' &&
    FEDERATING_CONNECTORS.has(idpClaim.connector_id)
      ? dexSubjectConnector(idpClaim.user_id)
      : idpClaim?.connector_id;

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
    connectorId === 'giantswarm-github' && userInfo.preferred_username
      ? ['metadata.name', userInfo.preferred_username]
      : ['spec.profile.email', verifiedEmail(userInfo)];
  if (!value) {
    return signInWithGuestUser(ctx);
  }

  try {
    return await ctx.signInWithCatalogUser({ filter: { [field]: value } });
  } catch (err) {
    return signInWithGuestUser(ctx);
  }
}
