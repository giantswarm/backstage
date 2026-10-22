import {
  jwtLifetimeSeconds,
  readJwtClaims,
  readJwtLifetimeClaims,
} from './jwtClaims';

function jwt(claims: unknown): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

describe('readJwtClaims', () => {
  it('reads the payload, also outside ASCII', () => {
    expect(readJwtClaims(jwt({ sub: 'jürgen', iat: 1 }))).toEqual({
      sub: 'jürgen',
      iat: 1,
    });
  });

  it('is undefined for anything that is no JWT with an object payload', () => {
    expect(readJwtClaims(undefined)).toBeUndefined();
    expect(readJwtClaims('opaque-token')).toBeUndefined();
    expect(readJwtClaims('a.!!!.c')).toBeUndefined();
    expect(readJwtClaims(jwt('a string'))).toBeUndefined();
  });
});

describe('readJwtLifetimeClaims', () => {
  it('reads numeric exp and iat only', () => {
    expect(readJwtLifetimeClaims(jwt({ exp: 20, iat: '10' }))).toEqual({
      exp: 20,
      iat: undefined,
    });
  });
});

describe('jwtLifetimeSeconds', () => {
  it('is exp − iat', () => {
    expect(jwtLifetimeSeconds(jwt({ iat: 100, exp: 1900 }))).toBe(1800);
  });

  it('is undefined without both, or with exp not after iat', () => {
    expect(jwtLifetimeSeconds(jwt({ exp: 1900 }))).toBeUndefined();
    expect(jwtLifetimeSeconds(jwt({ iat: 100, exp: 100 }))).toBeUndefined();
    expect(jwtLifetimeSeconds('opaque-token')).toBeUndefined();
  });
});
