import { identityHeaders, readEmailClaim } from './identity';

function jwt(payload: unknown): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`;
}

describe('readEmailClaim', () => {
  it('reads the email claim of a JWT without verifying it', () => {
    expect(readEmailClaim(jwt({ email: 'dev@lab.local' }))).toBe('dev@lab.local');
  });

  it('is undefined for a token without an email, a non-JWT, or garbage', () => {
    expect(readEmailClaim(jwt({ sub: 'x' }))).toBeUndefined();
    expect(readEmailClaim('opaque-token')).toBeUndefined();
    expect(readEmailClaim('a.!!!.c')).toBeUndefined();
    expect(readEmailClaim(undefined)).toBeUndefined();
  });
});

describe('identityHeaders', () => {
  it('sends both the bearer and the derived user id', () => {
    const token = jwt({ email: 'dev@lab.local' });
    expect(identityHeaders({ userToken: token })).toEqual({
      authorization: `Bearer ${token}`,
      'x-user-id': 'dev@lab.local',
    });
  });

  it('prefers an explicit user id and copes without a token', () => {
    expect(identityHeaders({ userId: 'me@lab.local' })).toEqual({
      'x-user-id': 'me@lab.local',
    });
    expect(identityHeaders({})).toEqual({});
  });
});
