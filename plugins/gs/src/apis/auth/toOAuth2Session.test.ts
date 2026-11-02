import { toOAuth2Session } from './toOAuth2Session';

function jwt(claims: Record<string, unknown>): string {
  const b64url = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'RS256' })}.${b64url(claims)}.signature`;
}

const NOW = 1_700_000_000_000;

function response(idToken: string, expiresInSeconds?: number) {
  return {
    providerInfo: {
      idToken,
      accessToken: 'access',
      scope: 'openid email',
      expiresInSeconds,
    },
    profile: {},
    backstageIdentity: {
      token: 'backstage',
      identity: {
        type: 'user' as const,
        userEntityRef: 'user:default/someone',
        ownershipEntityRefs: [],
      },
      expiresInSeconds: 3600,
    },
  };
}

describe('toOAuth2Session', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('expires the session with the ID token when that lapses first', () => {
    const idTokenExp = NOW / 1000 + 600;
    const session = toOAuth2Session(response(jwt({ exp: idTokenExp }), 3600));
    expect(session.providerInfo.expiresAt).toEqual(new Date(idTokenExp * 1000));
  });

  it('expires the session with the ID token when the backend reports no lifetime', () => {
    const idTokenExp = NOW / 1000 + 600;
    const session = toOAuth2Session(response(jwt({ exp: idTokenExp })));
    expect(session.providerInfo.expiresAt).toEqual(new Date(idTokenExp * 1000));
  });

  it('keeps the reported lifetime when it is the shorter one', () => {
    const session = toOAuth2Session(
      response(jwt({ exp: NOW / 1000 + 7200 }), 300),
    );
    expect(session.providerInfo.expiresAt).toEqual(new Date(NOW + 300_000));
  });

  it('keeps the reported lifetime for an ID token without exp', () => {
    const session = toOAuth2Session(response('opaque', 300));
    expect(session.providerInfo.expiresAt).toEqual(new Date(NOW + 300_000));
    expect(session.providerInfo.idToken).toBe('opaque');
    expect(session.providerInfo.scopes).toEqual(new Set(['openid', 'email']));
    expect(session.backstageIdentity?.expiresAt).toEqual(
      new Date(NOW + 3_600_000),
    );
  });
});
