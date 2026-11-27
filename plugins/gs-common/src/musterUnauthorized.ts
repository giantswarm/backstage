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

/**
 * One provider App a `server_sign_in_required` 401 asks the person to grant
 * (body's `error.apps`): muster's answer to a call of a server that receives
 * the person's App grants, made without that grant. `authUrl` is muster's
 * sign-in link for it, absent when muster could not start one (a device-code
 * App, its sign-in rate limit).
 */
export type MusterProviderAppGrant = { app: string; authUrl?: string };

/**
 * The Apps of muster's provider-App answer (`structuredContent.apps`, or a
 * 401 body's `error.apps`), the malformed entries left out; none when it is
 * not a list.
 */
export function musterProviderAppGrantsOf(
  value: unknown,
): MusterProviderAppGrant[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(entry => {
    const { app, authUrl } = (entry ?? {}) as {
      app?: unknown;
      authUrl?: unknown;
    };
    if (typeof app !== 'string' || app === '') {
      return [];
    }
    return [
      typeof authUrl === 'string' && authUrl !== ''
        ? { app, authUrl }
        : { app },
    ];
  });
}
