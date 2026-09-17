import {
  describeMcpFailure,
  isClosedClientError,
  isLostSessionError,
  isRecoverableSessionError,
} from './mcpErrors';

/** What `@ai-sdk/mcp`'s http transport throws: an MCPClientError with the status. */
function transportError(status: number, body: string) {
  const error = new Error(
    `MCP HTTP Transport Error: POSTing to endpoint (HTTP ${status}): ${body}`,
  ) as Error & { statusCode?: number };
  error.name = 'MCPClientError';
  error.statusCode = status;
  return error;
}

describe('isClosedClientError', () => {
  it('detects the SDK closed-client error message', () => {
    expect(
      isClosedClientError(
        new Error('Attempted to send a request from a closed client'),
      ),
    ).toBe(true);
    expect(
      isClosedClientError(
        'wrapped: Attempted to send a request from a closed client (foo)',
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isClosedClientError(undefined)).toBe(false);
    expect(isClosedClientError(null)).toBe(false);
    expect(isClosedClientError(new Error('network unreachable'))).toBe(false);
  });
});

describe('isLostSessionError', () => {
  it('recognises the gateway forgetting the session (404)', () => {
    expect(
      isLostSessionError(transportError(404, 'mcp: session not found')),
    ).toBe(true);
  });

  it('recognises the id-less request after the SDK cleared the id (400)', () => {
    expect(
      isLostSessionError(
        transportError(
          400,
          'mcp: session header is required for non-initialize requests',
        ),
      ),
    ).toBe(true);
    expect(isLostSessionError(transportError(400, 'Missing session ID'))).toBe(
      true,
    );
  });

  it('recognises a 404 on a tool call by status alone (modern protocol adds no hint)', () => {
    expect(isLostSessionError(transportError(404, 'not found'))).toBe(true);
  });

  it('leaves other failures alone', () => {
    expect(
      isLostSessionError(transportError(401, 'authentication failure')),
    ).toBe(false);
    expect(isLostSessionError(transportError(502, 'bad gateway'))).toBe(false);
    expect(isLostSessionError(new Error('pool has replicas'))).toBe(false);
    expect(isLostSessionError(undefined)).toBe(false);
  });
});

describe('isRecoverableSessionError', () => {
  it('is a lost session or a closed client', () => {
    expect(
      isRecoverableSessionError(
        new Error('Attempted to send a request from a closed client'),
      ),
    ).toBe(true);
    expect(
      isRecoverableSessionError(transportError(404, 'mcp: session not found')),
    ).toBe(true);
    expect(isRecoverableSessionError(transportError(503, 'unavailable'))).toBe(
      false,
    );
  });
});

describe('describeMcpFailure', () => {
  it('puts a lost session into plain words without the transport text', () => {
    const reason = describeMcpFailure(
      transportError(
        400,
        'mcp: session header is required for non-initialize requests',
      ),
    );
    expect(reason).toBe(
      'the MCP session was lost and could not be re-established',
    );
    expect(reason).not.toMatch(/session header is required|Transport/);
  });

  it('names the HTTP status of any other transport failure', () => {
    expect(describeMcpFailure(transportError(502, 'bad gateway'))).toBe(
      'the muster endpoint answered HTTP 502',
    );
  });

  it('describes a closed client and an unreachable endpoint', () => {
    expect(
      describeMcpFailure(
        new Error('Attempted to send a request from a closed client'),
      ),
    ).toBe('the connection was closed');
    const fetchFailed = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      }),
    });
    expect(describeMcpFailure(fetchFailed)).toBe(
      'the connection failed (ECONNREFUSED)',
    );
  });

  it('leaves a 401 alone so the frontend keeps its sign-in prompt', () => {
    expect(
      describeMcpFailure(
        transportError(401, 'authentication failure: token expired'),
      ),
    ).toBeUndefined();
  });

  it("leaves errors that are not the transport's alone", () => {
    expect(describeMcpFailure(new Error('pool has 2 replicas'))).toBe(
      undefined,
    );
    expect(describeMcpFailure(undefined)).toBeUndefined();
  });
});
