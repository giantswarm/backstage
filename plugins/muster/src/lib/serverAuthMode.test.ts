import { MCPServer } from './k8s';
import { serverAuthMode, signInServesOneSession } from './serverAuthMode';

function makeServer(spec: Record<string, unknown>): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'srv' },
      spec: { type: 'streamable-http', ...spec },
    } as never,
    'gazelle',
  );
}

describe('serverAuthMode', () => {
  it.each([
    ['anonymous', {}],
    ['anonymous', { auth: { type: 'none' } }],
    ['own-account', { auth: { type: 'oauth' } }],
    [
      'platform-sso',
      { auth: { type: 'oauth', forwardToken: true, requiredAudiences: ['k'] } },
    ],
    [
      'token-exchange',
      {
        auth: {
          forwardToken: true,
          tokenExchange: { enabled: true, connectorId: 'giantswarm' },
        },
      },
    ],
    ['sigv4', { auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } } }],
    // The precedence the checks rely on.
    ['sigv4', { auth: { type: 'sigv4', forwardToken: true } }],
    [
      'platform-sso',
      { auth: { forwardToken: true, tokenExchange: { enabled: false } } },
    ],
    [
      'token-exchange',
      { auth: { type: 'oauth', tokenExchange: { enabled: true } } },
    ],
    ['unknown', { auth: { type: 'mtls' } }],
  ])('classifies %s', (mode, spec) => {
    expect(serverAuthMode(makeServer(spec))).toBe(mode);
  });
});

describe('signInServesOneSession', () => {
  const discovered = makeServer({ auth: { type: 'oauth' } });
  const pinned = (grantScope?: string) =>
    makeServer({
      auth: {
        type: 'oauth',
        authorizationServer: {
          issuer: 'https://auth.example.com',
          ...(grantScope ? { grantScope } : {}),
        },
      },
    });

  it('reads the spec: an own-account sign-in is per session unless pinned with subject', () => {
    expect(signInServesOneSession(discovered)).toBe(true);
    expect(signInServesOneSession(pinned())).toBe(true);
    expect(signInServesOneSession(pinned('session'))).toBe(true);
    expect(signInServesOneSession(pinned('subject'))).toBe(false);
  });

  it('never says it of a server without a sign-in of the person’s own', () => {
    for (const spec of [
      {},
      { auth: { type: 'oauth', forwardToken: true } },
      { auth: { forwardToken: true, tokenExchange: { enabled: true } } },
      { auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } } },
    ]) {
      expect(signInServesOneSession(makeServer(spec))).toBe(false);
    }
  });

  it('takes muster’s own report over the spec where it has one', () => {
    expect(
      signInServesOneSession(discovered, {
        kind: 'grant',
        grant_scope: 'subject',
      }),
    ).toBe(false);
    expect(
      signInServesOneSession(pinned('subject'), {
        kind: 'grant',
        grant_scope: 'session',
      }),
    ).toBe(true);
    expect(signInServesOneSession(discovered, { kind: 'sso' })).toBe(false);
    // An older muster reports neither: the spec decides.
    expect(signInServesOneSession(discovered, {})).toBe(true);
  });
});
