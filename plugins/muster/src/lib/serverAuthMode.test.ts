import { MCPServer } from './k8s';
import { serverAuthMode } from './serverAuthMode';

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
