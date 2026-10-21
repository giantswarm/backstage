/**
 * How long before its `exp` an ID token already counts as expired: a token
 * sent in that window may lapse in flight or on a clock a little ahead of the
 * browser's.
 */
export const ID_TOKEN_EXPIRY_SKEW_MS = 60_000;

/**
 * The numeric `exp` and `iat` claims of a JWT, in seconds, or an empty object
 * when the value is not a JWT. The signature is not checked: the token is the
 * browser's own, and only its lifetime is read.
 */
function readLifetimeClaims(token: string): { exp?: number; iat?: number } {
  const payload = token.split('.')[1];
  if (!payload) {
    return {};
  }
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const { exp, iat } = JSON.parse(json) as { exp?: unknown; iat?: unknown };
    return {
      exp: typeof exp === 'number' ? exp : undefined,
      iat: typeof iat === 'number' ? iat : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * The `exp` of a JWT as a Date, or undefined when the value is not a JWT or
 * carries no numeric `exp`.
 */
export function idTokenExpiresAt(token: string): Date | undefined {
  const { exp } = readLifetimeClaims(token);
  return exp === undefined ? undefined : new Date(exp * 1000);
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

/**
 * The share of a JWT's lifetime (`exp` − `iat`) still ahead of `now`, from 0
 * (expired) to 1 (just issued), or undefined when the token carries no
 * numeric `exp` and `iat` to measure it by.
 */
export function idTokenLifetimeLeft(
  token: string,
  now: number = Date.now(),
): number | undefined {
  const { exp, iat } = readLifetimeClaims(token);
  if (exp === undefined || iat === undefined || exp <= iat) {
    return undefined;
  }
  const left = (exp * 1000 - now) / ((exp - iat) * 1000);
  return Math.min(1, Math.max(0, left));
}

/**
 * Whether a JWT has at least `minLifetimeLeft` (a share of its lifetime, see
 * {@link idTokenLifetimeLeft}) still ahead of it. A token whose lifetime
 * cannot be read counts as having it: nothing here can tell otherwise, and a
 * refresh would not make it readable.
 */
export function hasIdTokenLifetimeLeft(
  token: string,
  minLifetimeLeft: number,
  now: number = Date.now(),
): boolean {
  const left = idTokenLifetimeLeft(token, now);
  return left === undefined || left >= minLifetimeLeft;
}
