import {
  ID_TOKEN_EXPIRY_SKEW_MS,
  hasIdTokenLifetimeLeft,
  idTokenExpiresAt,
  idTokenLifetimeLeft,
  isIdTokenExpired,
} from './idTokenExpiry';

function jwt(claims: Record<string, unknown>): string {
  const b64url = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'RS256' })}.${b64url(claims)}.signature`;
}

describe('idTokenExpiresAt', () => {
  it('reads the exp claim', () => {
    expect(idTokenExpiresAt(jwt({ exp: 1_700_000_000 }))).toEqual(
      new Date(1_700_000_000_000),
    );
  });

  it('is undefined for a token without exp or that is no JWT', () => {
    expect(idTokenExpiresAt(jwt({ sub: 'someone' }))).toBeUndefined();
    expect(idTokenExpiresAt('opaque-token')).toBeUndefined();
    expect(idTokenExpiresAt('a.!!!.c')).toBeUndefined();
  });
});

describe('isIdTokenExpired', () => {
  const now = 1_700_000_000_000;

  it('is true once exp has passed', () => {
    expect(isIdTokenExpired(jwt({ exp: now / 1000 - 1 }), now)).toBe(true);
  });

  it('is true within the skew before exp', () => {
    const exp = (now + ID_TOKEN_EXPIRY_SKEW_MS / 2) / 1000;
    expect(isIdTokenExpired(jwt({ exp }), now)).toBe(true);
  });

  it('is false for a token valid beyond the skew', () => {
    const exp = (now + ID_TOKEN_EXPIRY_SKEW_MS + 60_000) / 1000;
    expect(isIdTokenExpired(jwt({ exp }), now)).toBe(false);
  });

  it('is false when the lifetime cannot be read', () => {
    expect(isIdTokenExpired('opaque-token', now)).toBe(false);
  });
});

describe('idTokenLifetimeLeft', () => {
  // A 30-minute token issued at `iat`.
  const iat = 1_700_000_000;
  const token = jwt({ iat, exp: iat + 30 * 60 });

  it('is the share of exp − iat still ahead', () => {
    expect(idTokenLifetimeLeft(token, iat * 1000)).toBe(1);
    expect(idTokenLifetimeLeft(token, (iat + 5 * 60) * 1000)).toBeCloseTo(
      25 / 30,
    );
    expect(idTokenLifetimeLeft(token, (iat + 27 * 60) * 1000)).toBeCloseTo(
      3 / 30,
    );
  });

  it('is 0 once expired and 1 on a clock behind iat', () => {
    expect(idTokenLifetimeLeft(token, (iat + 31 * 60) * 1000)).toBe(0);
    expect(idTokenLifetimeLeft(token, (iat - 60) * 1000)).toBe(1);
  });

  it('is undefined without exp and iat', () => {
    expect(idTokenLifetimeLeft(jwt({ exp: iat }), iat * 1000)).toBeUndefined();
    expect(idTokenLifetimeLeft(jwt({ iat }), iat * 1000)).toBeUndefined();
    expect(idTokenLifetimeLeft('opaque-token')).toBeUndefined();
  });
});

describe('hasIdTokenLifetimeLeft', () => {
  const iat = 1_700_000_000;
  const token = jwt({ iat, exp: iat + 30 * 60 });

  it('compares the share left with the minimum', () => {
    expect(hasIdTokenLifetimeLeft(token, 5 / 6, (iat + 4 * 60) * 1000)).toBe(
      true,
    );
    expect(hasIdTokenLifetimeLeft(token, 5 / 6, (iat + 6 * 60) * 1000)).toBe(
      false,
    );
  });

  it('is true when the lifetime cannot be read', () => {
    expect(hasIdTokenLifetimeLeft('opaque-token', 5 / 6)).toBe(true);
  });
});
