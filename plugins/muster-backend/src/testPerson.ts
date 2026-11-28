import { createHash } from 'node:crypto';

/**
 * Test helpers: an unsigned JWT with the claims given, and the Backstage user
 * the portal's sign-in maps a non-staff subject onto (`oidcIdentity`).
 */
export function testJwt(claims: Record<string, unknown>): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.c2ln`;
}

export function externalUserRef(subject: string): string {
  return `user:oidc/${createHash('sha256').update(subject).digest('hex').slice(0, 40)}`;
}

/** Alice's portal token and the user she is signed in to the portal as. */
export const PERSON_TOKEN = testJwt({
  iss: 'https://dex.gazelle.example',
  sub: 'alice-subject',
  email: 'alice@example.com',
  email_verified: true,
});
export const PERSON_REF = externalUserRef('alice-subject');

/** Bob's token: a valid portal token of another person. */
export const OTHER_PERSON_TOKEN = testJwt({
  iss: 'https://dex.gazelle.example',
  sub: 'bob-subject',
  email: 'bob@example.com',
  email_verified: true,
});
