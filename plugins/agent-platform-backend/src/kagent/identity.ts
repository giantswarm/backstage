/**
 * Who the caller is, for kagent `main`.
 *
 * The controller partitions AgentInstances by the `x-user-id` metadata (its
 * creator key) and forwards `authorization` unchanged to the agent, which re-emits
 * it on its MCP calls so muster sees the person. Both are needed on every call:
 * without `x-user-id` everything files under `admin@kagent.dev`; without the
 * bearer the agent's tool calls get 401.
 *
 * The user id is the person's email. The frontend forwards only the Dex ID token,
 * whose `email` claim carries it, so it is read off the token here — **decoded,
 * not verified**: kagent trusts the header as a partition key and the token is
 * verified where it matters (muster, the apiserver). A caller that already knows
 * the id (a test, a future Backstage-identity path) passes it and skips the
 * decode.
 */

/** The identity headers one kagent call carries. */
export type KagentIdentity = {
  /** `Authorization: Bearer` toward kagent; forwarded to the agent. */
  userToken?: string;
  /** `x-user-id` toward kagent; the creator/partition key. */
  userId?: string;
};

/**
 * The `email` claim of a JWT, or `undefined` when the token is not a JWT, has no
 * payload, or carries no string email. Never throws: an odd token must fail the
 * request at kagent's door with kagent's own words, not here with ours.
 */
export function readEmailClaim(token: string | undefined): string | undefined {
  if (!token) {
    return undefined;
  }
  const segments = token.split('.');
  if (segments.length < 2) {
    return undefined;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8'),
    ) as { email?: unknown };
    return typeof payload.email === 'string' && payload.email
      ? payload.email
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The gRPC metadata for one call: `authorization` when a token is known and
 * `x-user-id` from the explicit id, else from the token's email claim.
 */
export function identityHeaders(identity: KagentIdentity): Record<string, string> {
  const headers: Record<string, string> = {};
  if (identity.userToken) {
    headers.authorization = `Bearer ${identity.userToken}`;
  }
  const userId = identity.userId ?? readEmailClaim(identity.userToken);
  if (userId) {
    headers['x-user-id'] = userId;
  }
  return headers;
}
