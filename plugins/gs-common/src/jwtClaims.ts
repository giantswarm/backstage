/**
 * The payload of a JWT as an object, or undefined when the value is not a JWT
 * with a JSON object payload. The signature is not checked: this is for the
 * claims of a token the caller already holds (its subject, its lifetime),
 * never for deciding whether to trust it.
 *
 * Shared by the frontend and the backend, so it uses `atob` and
 * `TextDecoder`, which both have.
 */
export function readJwtClaims(
  token: string | undefined,
): Record<string, unknown> | undefined {
  const payload = token?.split('.')[1];
  if (!payload) {
    return undefined;
  }
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const claims: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(binary, char => char.charCodeAt(0)),
      ),
    );
    return typeof claims === 'object' && claims !== null
      ? (claims as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The numeric `exp` and `iat` claims of a JWT, in seconds; each undefined
 * when absent or not a number.
 */
export function readJwtLifetimeClaims(token: string | undefined): {
  exp?: number;
  iat?: number;
} {
  const claims = readJwtClaims(token);
  return {
    exp: typeof claims?.exp === 'number' ? claims.exp : undefined,
    iat: typeof claims?.iat === 'number' ? claims.iat : undefined,
  };
}

/**
 * A JWT's lifetime, `exp` − `iat`, in seconds: both on the issuer's clock, so
 * no clock skew enters it. Undefined when either claim is missing or `exp` is
 * not after `iat`.
 */
export function jwtLifetimeSeconds(
  token: string | undefined,
): number | undefined {
  const { exp, iat } = readJwtLifetimeClaims(token);
  return exp !== undefined && iat !== undefined && exp > iat
    ? exp - iat
    : undefined;
}
