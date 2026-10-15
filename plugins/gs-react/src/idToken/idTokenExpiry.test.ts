import {
  ID_TOKEN_EXPIRY_SKEW_MS,
  idTokenExpiresAt,
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
