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

const GIANT_SWARM_CONNECTORS = new Set(['giantswarm-ad', 'giantswarm-github']);

/** Namespace of identities from an issuer that sends no `federated_claims`. */
const NON_DEX_NAMESPACE = 'oidc';

const MAX_LENGTH = 63;
const DNS_LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAIN_NAME = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

function sha256Hex(value: string, length: number): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

/**
 * The namespace of a Dex connector's identities. A connector id that already
 * is a lowercase DNS label maps to `dex-<id>`; any other id maps to
 * `dexh-<slug>-<hash of the exact id>`. The two forms never overlap, neither
 * produces `default` or {@link NON_DEX_NAMESPACE}, and distinct connector ids
 * give distinct namespaces.
 */
function connectorNamespace(connectorId: string): string {
  const plain = `dex-${connectorId}`;
  if (DNS_LABEL.test(connectorId) && plain.length <= MAX_LENGTH) {
    return plain;
  }
  const hash = sha256Hex(connectorId, 16);
  const slug = connectorId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_LENGTH - 'dexh-'.length - hash.length - 1)
    .replace(/^-+|-+$/g, '');
  return slug ? `dexh-${slug}-${hash}` : `dexh-${hash}`;
}

/**
 * The entity name of an upstream user id. An id that already is a lowercase
 * entity name without `_` is used as is; any other id maps to `h_<hash>`,
 * which always contains `_`, so the two forms never overlap. Only lowercase
 * ids are used as is, so ids differing only in case stay apart under the
 * case-insensitive comparison of entity refs.
 */
function upstreamUserName(userId: string): string {
  if (PLAIN_NAME.test(userId) && userId.length <= MAX_LENGTH) {
    return userId;
  }
  return `h_${sha256Hex(userId, 40)}`;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
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
 * to `user:<namespace>/<name>` from claims of the issuer's own token: on Dex,
 * the namespace comes from `federated_claims.connector_id` and the name from
 * `federated_claims.user_id`, the pair Dex itself keys an identity on; an
 * issuer without `federated_claims` resolves into the `oidc` namespace by the
 * token's `sub`. Such users have no catalog entity and never resolve into
 * `default`; a token missing those claims is refused.
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

  let userRef: string;
  if (idpClaim) {
    const connector = nonEmptyString(connectorId);
    const userId = nonEmptyString(idpClaim.user_id);
    if (!connector || !userId) {
      throw new NotAllowedError(
        'The identity token names no connector or upstream user',
      );
    }
    userRef = `user:${connectorNamespace(connector)}/${upstreamUserName(
      userId,
    )}`;
  } else {
    const subject = nonEmptyString(userInfo.sub);
    if (!subject) {
      throw new NotAllowedError('The identity token names no subject');
    }
    userRef = `user:${NON_DEX_NAMESPACE}/${upstreamUserName(subject)}`;
  }

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
  try {
    if (connectorId === 'giantswarm-ad' && userInfo.email) {
      return await ctx.signInWithCatalogUser({
        filter: {
          'spec.profile.email': userInfo.email,
        },
      });
    }

    if (connectorId === 'giantswarm-github' && userInfo.preferred_username) {
      return await ctx.signInWithCatalogUser({
        filter: {
          'metadata.name': userInfo.preferred_username,
        },
      });
    }
  } catch (err) {
    return signInWithGuestUser(ctx);
  }

  if (userInfo.email) {
    const username = userInfo.email.split('@')[0];
    const userRef = `user:default/${username}`;

    return ctx.issueToken({
      claims: {
        sub: userRef,
        ent: [userRef],
      },
    });
  }

  return signInWithGuestUser(ctx);
}
