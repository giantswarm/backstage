import { createHash } from 'node:crypto';
import { readJwtClaims } from '@giantswarm/backstage-plugin-gs-common';

/**
 * Who an OIDC identity of the portal's main login is in Backstage: the one
 * mapping the sign-in resolver (`auth-backend-module-gs`) applies when the
 * person signs in, and the muster backend applies to the token the frontend
 * forwards, so that it presents only the signed-in person's own token.
 *
 * - `catalog`: a Giant Swarm staff identity, found in the catalog by the
 *   field and value given.
 * - `external`: any other identity, `user:oidc/<hash of sub>`; such users
 *   have no catalog entity.
 * - `refused`: the identity names nobody the portal signs in.
 */
export type OidcIdentity =
  | {
      kind: 'catalog';
      field: 'metadata.name' | 'spec.profile.email';
      value: string;
    }
  | { kind: 'external'; userEntityRef: string }
  | { kind: 'refused'; reason: string };

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
  'giantswarm-gazelle-oidc',
]);

/** Namespace of every identity that is not looked up in the catalog. */
export const EXTERNAL_IDENTITY_NAMESPACE = 'oidc';

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
 * The claims' email when the issuer has verified it. An unverified email
 * names nobody: it is whatever the upstream account claims.
 */
function verifiedEmail(claims: Record<string, unknown>): string | undefined {
  return claims.email_verified === true && typeof claims.email === 'string'
    ? claims.email
    : undefined;
}

/**
 * Maps the claims of an OIDC identity (the ID token's, or the userinfo
 * answer's, which Dex fills alike) onto who the person is in Backstage.
 *
 * Identities from the Giant Swarm Dex connectors, directly or through the
 * Dex of gazelle and graveler, are looked up in the catalog, whose users live
 * in the `default` namespace. Every other identity resolves to
 * `user:oidc/<name>` from the `sub`, which the issuer keeps unique (Dex
 * encodes the connector and upstream user id into it); one without a `sub`
 * is refused.
 */
export function oidcIdentity(claims: Record<string, unknown>): OidcIdentity {
  const idpClaim = claims.federated_claims as
    { connector_id?: unknown; user_id?: unknown } | undefined;
  const connectorId =
    typeof idpClaim?.connector_id === 'string' &&
    FEDERATING_CONNECTORS.has(idpClaim.connector_id)
      ? dexSubjectConnector(idpClaim.user_id)
      : idpClaim?.connector_id;

  if (
    typeof connectorId === 'string' &&
    GIANT_SWARM_CONNECTORS.has(connectorId)
  ) {
    if (
      connectorId === 'giantswarm-github' &&
      typeof claims.preferred_username === 'string' &&
      claims.preferred_username !== ''
    ) {
      return {
        kind: 'catalog',
        field: 'metadata.name',
        value: claims.preferred_username,
      };
    }
    const email = verifiedEmail(claims);
    return email
      ? { kind: 'catalog', field: 'spec.profile.email', value: email }
      : {
          kind: 'refused',
          reason:
            'The identity token carries no verified email to find you in the catalog',
        };
  }

  if (typeof claims.sub !== 'string' || claims.sub === '') {
    return { kind: 'refused', reason: 'The identity token names no subject' };
  }
  return {
    kind: 'external',
    userEntityRef: `user:${EXTERNAL_IDENTITY_NAMESPACE}/${subjectName(claims.sub)}`,
  };
}

/**
 * `oidcIdentity` of a token's claims. The signature is not checked: whoever
 * the token is then presented to verifies it, and a token whose claims were
 * altered is refused there.
 */
export function tokenOidcIdentity(token: string): OidcIdentity {
  const claims = readJwtClaims(token);
  return claims
    ? oidcIdentity(claims)
    : { kind: 'refused', reason: 'The token is no JWT' };
}
