import { isInfrastructureError, parseAuthLoginResult } from './authLogin';

describe('parseAuthLoginResult', () => {
  it('takes the sign-in URL from structuredContent.authUrl', () => {
    const message = [
      'Authentication Required',
      '',
      'Server: pro',
      'Please sign in to connect to this server:',
      '',
      'https://muster.gazelle.example.io/oauth/proxy/start?state=abc123',
    ].join('\n');

    expect(
      parseAuthLoginResult({
        text: message,
        structuredContent: {
          authUrl:
            'https://muster.gazelle.example.io/oauth/proxy/start?state=abc123',
        },
      }),
    ).toEqual({
      status: 'auth_required',
      authUrl:
        'https://muster.gazelle.example.io/oauth/proxy/start?state=abc123',
      message,
      clientIdMethod: undefined,
    });
  });

  // muster#1083: the challenge says how muster identifies itself to the
  // authorization server, so the UI can warn when the AS supports neither
  // CIMD nor DCR.
  it.each(['cimd', 'dcr', 'cimd-fallback', 'dcr-failed'] as const)(
    'passes through clientIdMethod %j',
    method => {
      expect(
        parseAuthLoginResult({
          text: 'Authentication Required',
          structuredContent: {
            authUrl: 'https://example.com/start',
            clientIdMethod: method,
          },
        }),
      ).toEqual({
        status: 'auth_required',
        authUrl: 'https://example.com/start',
        message: 'Authentication Required',
        clientIdMethod: method,
      });
    },
  );

  it('drops an unrecognised clientIdMethod instead of passing it through', () => {
    expect(
      parseAuthLoginResult({
        text: 'Authentication Required',
        structuredContent: {
          authUrl: 'https://example.com/start',
          clientIdMethod: 'something-new',
        },
      }),
    ).toEqual({
      status: 'auth_required',
      authUrl: 'https://example.com/start',
      message: 'Authentication Required',
      clientIdMethod: undefined,
    });
  });

  /**
   * The URL is read from structuredContent ONLY (muster#1025). A URL that
   * merely appears in the prose — a success answer listing the server's
   * endpoint, a docs link — must not be mistaken for a challenge, which is why
   * the old line-scanning fallback was retired.
   */
  it('does not scan the prose for URLs', () => {
    const message = [
      'New answer with a link:',
      'https://pro.gazelle.example.io/mcp',
    ].join('\n');

    expect(parseAuthLoginResult({ text: message })).toEqual({
      status: 'unknown',
      message,
    });
  });

  // The three api.AuthMsg* markers muster's own CLI matches on, plus the
  // "no auth needed" answer. Connection outcomes carry no structuredContent.
  it.each([
    "Server 'pro' is already authenticated and connected.",
    "Server 'pro' is already authenticated.",
    "Server 'pro' does not require authentication.",
    "Successfully connected to 'pro'!\n\nAvailable capabilities:\n- Tools: 12\n",
    'Already Connected',
  ])('classifies %j as connected', message => {
    expect(parseAuthLoginResult({ text: message })).toEqual({
      status: 'connected',
      message,
    });
  });

  it('prefers structuredContent over a connected marker in the prose', () => {
    // Both present is a fresh challenge by contract: muster only sets
    // structuredContent.authUrl when it issued one.
    expect(
      parseAuthLoginResult({
        text: 'Already Connected',
        structuredContent: { authUrl: 'https://example.com/start' },
      }),
    ).toEqual({
      status: 'auth_required',
      authUrl: 'https://example.com/start',
      message: 'Already Connected',
    });
  });

  it('flags an unrecognised answer instead of guessing', () => {
    expect(
      parseAuthLoginResult({ text: 'Something entirely new happened.' }),
    ).toEqual({
      status: 'unknown',
      message: 'Something entirely new happened.',
    });
  });

  it('handles a result with no text at all', () => {
    expect(parseAuthLoginResult({})).toEqual({
      status: 'unknown',
      message: '',
    });
  });

  it('ignores a non-string authUrl', () => {
    expect(
      parseAuthLoginResult({
        text: 'odd',
        structuredContent: { authUrl: 42 },
      }),
    ).toEqual({ status: 'unknown', message: 'odd' });
  });
});

describe('isInfrastructureError', () => {
  it.each([
    [
      'a closed client',
      new Error('Attempted to send a request from a closed client'),
    ],
    ['a transport failure', new TypeError('fetch failed')],
    [
      'a Backstage dependency error',
      Object.assign(new Error('no executor'), {
        name: 'ServiceUnavailableError',
      }),
    ],
    /**
     * @ai-sdk/mcp reports every non-2xx from muster's endpoint as an
     * MCPClientError carrying the status -- an ingress 5xx, a 401/403 from
     * muster's OAuth proxy, an expired MCP session. `name` is the discriminator
     * because isInstance() matches any AISDKError.
     */
    [
      'an MCP transport HTTP error',
      Object.assign(
        new Error(
          'MCP HTTP Transport Error: POSTing to endpoint (HTTP 502): <html>',
        ),
        { name: 'MCPClientError', statusCode: 502 },
      ),
    ],
    [
      'an OAuth-proxy 401 from the transport',
      Object.assign(new Error('MCP HTTP Transport Error: (HTTP 401)'), {
        name: 'MCPClientError',
        statusCode: 401,
      }),
    ],
    [
      'a protocol error reporting a numeric code',
      Object.assign(new Error('Unexpected content type'), { code: -1 }),
    ],
  ])('treats %s as infrastructure', (_label, error) => {
    expect(isInfrastructureError(error)).toBe(true);
  });

  // Muster's own refusals arrive as a plain Error carrying its message.
  it.each([
    "Server 'pro' uses SSO and is connected automatically.",
    'Rate limit exceeded. Too many authentication attempts.',
    "Cannot authenticate to 'pro': RFC 9728 protected resource metadata not found.",
  ])('treats the tool-level refusal %j as muster declining', message => {
    expect(isInfrastructureError(new Error(message))).toBe(false);
  });
});
