import { parseAuthLoginResult } from './authLogin';

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
