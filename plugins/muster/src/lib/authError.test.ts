import {
  connectorSaveErrorMessage,
  isForbiddenError,
  isMusterAuthError,
  mutationErrorMessage,
  MUSTER_AUTH_PROMPT,
  NO_EDIT_RIGHTS_MESSAGE,
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

describe('connectorSaveErrorMessage', () => {
  it('says plainly that the person lacks edit rights on an RBAC refusal', () => {
    const rbac = new Error(
      'Failed to update MCP server: mcpservers.muster.giantswarm.io "wiki" is forbidden: User "dev@lab.local" cannot update resource "mcpservers" in API group "muster.giantswarm.io" in the namespace "muster"',
    );
    expect(isForbiddenError(rbac)).toBe(true);
    expect(connectorSaveErrorMessage(rbac)).toBe(NO_EDIT_RIGHTS_MESSAGE);
    expect(NO_EDIT_RIGHTS_MESSAGE).toMatch(/don't have rights to edit/);
    expect(isForbiddenError(new Error('forbidden: nope'))).toBe(true);
  });

  it('keeps other errors, and a missing session, as they were', () => {
    expect(connectorSaveErrorMessage(new Error('url is required'))).toBe(
      'url is required',
    );
    expect(connectorSaveErrorMessage(new Error('authentication failure'))).toBe(
      MUSTER_AUTH_PROMPT,
    );
    expect(isForbiddenError(new Error('authentication failure'))).toBe(false);
  });
});
