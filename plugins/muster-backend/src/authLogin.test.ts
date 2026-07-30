import { isInfrastructureError, parseAuthLoginResult } from './authLogin';

describe('parseAuthLoginResult', () => {
  it('extracts the sign-in URL from an auth challenge', () => {
    const message = [
      'Authentication Required',
      '',
      'Server: pro',
      'Status: Authentication required for pro. Please visit the link below to authenticate.',
      '',
      'Please sign in to connect to this server:',
      '',
      'https://muster.gazelle.example.io/oauth/proxy/start?state=abc123',
      '',
      'After signing in, run this tool again to complete the connection.',
    ].join('\n');

    expect(parseAuthLoginResult(message)).toEqual({
      status: 'auth_required',
      authUrl:
        'https://muster.gazelle.example.io/oauth/proxy/start?state=abc123',
      message,
    });
  });

  // The three api.AuthMsg* markers muster's own CLI matches on, plus the
  // "no auth needed" answer.
  it.each([
    "Server 'pro' is already authenticated and connected.",
    "Server 'pro' is already authenticated.",
    "Server 'pro' does not require authentication.",
    "Successfully connected to 'pro'!\n\nAvailable capabilities:\n- Tools: 12\n",
    'Already Connected',
  ])('classifies %j as connected', message => {
    expect(parseAuthLoginResult(message)).toEqual({
      status: 'connected',
      message,
    });
  });

  /**
   * The markers are the specific signal; a bare URL line is only the fallback.
   * A success answer that grows an endpoint or docs link must not be read as a
   * fresh challenge, or the UI offers a non-challenge link and polls for a
   * transition that already happened.
   */
  it('prefers a connected marker over a URL appearing in the same answer', () => {
    const message = [
      "Successfully connected to 'pro'!",
      '',
      'Available capabilities:',
      '- Tools: 12',
      '',
      'https://pro.gazelle.example.io/mcp',
    ].join('\n');

    expect(parseAuthLoginResult(message)).toEqual({
      status: 'connected',
      message,
    });
  });

  it('flags an unrecognised answer instead of guessing', () => {
    expect(parseAuthLoginResult('Something entirely new happened.')).toEqual({
      status: 'unknown',
      message: 'Something entirely new happened.',
    });
  });

  it('serialises a non-string payload so the message is still shown', () => {
    expect(parseAuthLoginResult({ unexpected: true })).toEqual({
      status: 'unknown',
      message: '{"unexpected":true}',
    });
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
