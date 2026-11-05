/**
 * Why a muster proxy (muster-backend) answers 401, in the body's
 * `error.reason`. The backend sets it, the frontend picks its action from it:
 *
 * - `server_sign_in_required` -- the person's muster session holds no grant
 *   for the server (`error.server`) the call needs: they sign in to it once.
 * - `token_missing` -- the request carried no token for an installation
 *   that needs the person's.
 * - `token_expired` -- the forwarded token has expired.
 * - `token_rejected` -- muster refused a forwarded token that has not
 *   expired by its `exp`.
 *
 * Each is refused before a tool runs, so sending the call again with a new
 * token is safe even for a write.
 */
export const MUSTER_UNAUTHORIZED_REASONS = [
  'server_sign_in_required',
  'token_missing',
  'token_expired',
  'token_rejected',
] as const;

export type MusterUnauthorizedReason =
  (typeof MUSTER_UNAUTHORIZED_REASONS)[number];

/** The reasons a fresh token can fix. */
export const MUSTER_TOKEN_REASONS: readonly MusterUnauthorizedReason[] = [
  'token_missing',
  'token_expired',
  'token_rejected',
];

export function isMusterUnauthorizedReason(
  value: unknown,
): value is MusterUnauthorizedReason {
  return MUSTER_UNAUTHORIZED_REASONS.includes(
    value as MusterUnauthorizedReason,
  );
}

/**
 * muster's answer when the bearer it forwards to a server has lapsed, e.g.
 * `token has expired for workspace-manager, re-authenticate to refresh: …`.
 */
export const MUSTER_TOKEN_EXPIRED_TEXT =
  /token has expired\b.*\bre-authenticate/i;
