import { MUSTER_AUTH_PROMPT } from './authError';
import { installationErrorLine, isMcpTransportText } from './installationError';

describe('installationErrorLine', () => {
  it("prints the backend's plain words as they are", () => {
    expect(
      installationErrorLine(
        'gazelle',
        new Error(
          'gazelle did not answer: the MCP session was lost and could not be re-established',
        ),
      ),
    ).toBe(
      'gazelle did not answer: the MCP session was lost and could not be re-established',
    );
  });

  it('never shows the SDK transport text', () => {
    const line = installationErrorLine(
      'gazelle',
      new Error(
        'MCP HTTP Transport Error: POSTing to endpoint (HTTP 400): mcp: session header is required for non-initialize requests',
      ),
    );
    expect(line).toBe('gazelle did not answer');
    expect(
      installationErrorLine(
        'gazelle',
        'Attempted to send a request from a closed client',
      ),
    ).toBe('gazelle did not answer');
    expect(installationErrorLine('gazelle', undefined)).toBe(
      'gazelle did not answer',
    );
  });

  it('turns a sign-in failure into the muster sign-in prompt', () => {
    const unauthorized = new Error('Muster request failed with status 401');
    unauthorized.name = 'UnauthorizedError';
    expect(installationErrorLine('gazelle', unauthorized)).toBe(
      `gazelle: ${MUSTER_AUTH_PROMPT}`,
    );
  });

  it('prefixes any other message with the installation', () => {
    expect(
      installationErrorLine('gazelle', new Error('pool has 2 replicas')),
    ).toBe('gazelle: pool has 2 replicas');
    expect(installationErrorLine('gazelle', 'no cluster-manager')).toBe(
      'gazelle: no cluster-manager',
    );
  });
});

describe('isMcpTransportText', () => {
  it('recognises the transport prefix and the session errors', () => {
    expect(isMcpTransportText('MCP HTTP Transport Error: GET SSE failed')).toBe(
      true,
    );
    expect(isMcpTransportText('upstream said mcp: session not found')).toBe(
      true,
    );
    expect(isMcpTransportText('gazelle did not answer: HTTP 502')).toBe(false);
  });
});
