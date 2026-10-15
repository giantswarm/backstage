/**
 * How long before its `exp` an ID token already counts as expired: a token
 * sent in that window may lapse in flight or on a clock a little ahead of the
 * browser's.
 */
export const ID_TOKEN_EXPIRY_SKEW_MS = 60_000;

/**
 * The `exp` of a JWT as a Date, or undefined when the value is not a JWT or
 * carries no numeric `exp`. The signature is not checked: the token is the
 * browser's own, and only its lifetime is read.
 */
export function idTokenExpiresAt(token: string): Date | undefined {
  const payload = token.split('.')[1];
  if (!payload) {
    return undefined;
  }
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? new Date(exp * 1000) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a JWT's `exp` has passed, or will within `skewMs`. A token whose
 * lifetime cannot be read counts as not expired: the receiver decides.
 */
export function isIdTokenExpired(
  token: string,
  now: number = Date.now(),
  skewMs: number = ID_TOKEN_EXPIRY_SKEW_MS,
): boolean {
  const expiresAt = idTokenExpiresAt(token);
  return expiresAt !== undefined && expiresAt.getTime() - skewMs <= now;
}
