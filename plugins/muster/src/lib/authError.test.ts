import {
  isMusterAuthError,
  mutationErrorMessage,
  MUSTER_AUTH_PROMPT,
} from './authError';

describe('isMusterAuthError', () => {
  it('detects the backstage-backend 401 tag', () => {
    const e = new Error('Muster request failed with status 401');
    e.name = 'UnauthorizedError';
    expect(isMusterAuthError(e)).toBe(true);
  });

  it('detects an MCP transport 401 surfaced in the message', () => {
    const e = new Error(
      'MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): authentication failure: token uses the unknown key "abc"',
    );
    expect(isMusterAuthError(e)).toBe(true);
  });

  it('detects a bare "authentication failure" message', () => {
    expect(isMusterAuthError(new Error('authentication failure'))).toBe(true);
  });

  it('does not flag non-auth errors', () => {
    expect(isMusterAuthError(new Error('step "probe": tool is required'))).toBe(
      false,
    );
    expect(isMusterAuthError(new Error('Invalid JSON: Unexpected token'))).toBe(
      false,
    );
    expect(isMusterAuthError(undefined)).toBe(false);
    expect(isMusterAuthError(null)).toBe(false);
  });
});

describe('mutationErrorMessage', () => {
  it('maps an auth failure to the connect prompt', () => {
    const e = new Error('… (HTTP 401): authentication failure');
    expect(mutationErrorMessage(e)).toBe(MUSTER_AUTH_PROMPT);
  });

  it('passes through a non-auth error message verbatim', () => {
    expect(mutationErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back when there is no message', () => {
    expect(mutationErrorMessage({})).toBe('The request failed.');
  });
});
