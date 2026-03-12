import { createSessionAwareTransport } from './createSessionAwareTransport';

// Mock StreamableHTTPClientTransport to capture the fetch function passed to it
let capturedFetch: (url: string | URL, init?: RequestInit) => Promise<Response>;

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn().mockImplementation((_url, opts) => {
    capturedFetch = opts.fetch;
    return { start: jest.fn(), send: jest.fn(), close: jest.fn() };
  }),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as any;

describe('createSessionAwareTransport', () => {
  const SESSION_HEADER = 'X-Muster-Session-ID';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(new Response('', { headers: new Headers() }));
  });

  it('creates a transport and passes custom fetch', () => {
    const transport = createSessionAwareTransport({
      url: 'http://muster/mcp',
      headers: { Authorization: 'Bearer token' },
      sessionHeader: SESSION_HEADER,
      logger: mockLogger,
    });

    expect(transport).toBeDefined();
    expect(capturedFetch).toBeDefined();
  });

  it('does not include session header on first request', async () => {
    createSessionAwareTransport({
      url: 'http://muster/mcp',
      sessionHeader: SESSION_HEADER,
      logger: mockLogger,
    });

    await capturedFetch('http://muster/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has(SESSION_HEADER)).toBe(false);
  });

  it('captures session header from response and replays on subsequent requests', async () => {
    createSessionAwareTransport({
      url: 'http://muster/mcp',
      sessionHeader: SESSION_HEADER,
      logger: mockLogger,
    });

    // First response includes session ID
    const sessionId = 'session-abc-123';
    mockFetch.mockResolvedValueOnce(
      new Response('', {
        headers: new Headers({ [SESSION_HEADER]: sessionId }),
      }),
    );

    await capturedFetch('http://muster/mcp', { method: 'POST' });

    // Second request should include the captured session ID
    mockFetch.mockResolvedValueOnce(
      new Response('', { headers: new Headers() }),
    );

    await capturedFetch('http://muster/mcp', { method: 'POST' });

    const [, secondInit] = mockFetch.mock.calls[1];
    const headers = new Headers(secondInit.headers);
    expect(headers.get(SESSION_HEADER)).toBe(sessionId);
  });

  it('logs when a new session is started', async () => {
    createSessionAwareTransport({
      url: 'http://muster/mcp',
      sessionHeader: SESSION_HEADER,
      logger: mockLogger,
    });

    const sessionId = 'session-abc-123';
    mockFetch.mockResolvedValueOnce(
      new Response('', {
        headers: new Headers({ [SESSION_HEADER]: sessionId }),
      }),
    );

    await capturedFetch('http://muster/mcp', { method: 'POST' });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      `New ${SESSION_HEADER} session started: ${sessionId}`,
    );
  });

  it('does not log when session ID is unchanged', async () => {
    createSessionAwareTransport({
      url: 'http://muster/mcp',
      sessionHeader: SESSION_HEADER,
      logger: mockLogger,
    });

    const sessionId = 'session-abc-123';
    mockFetch.mockResolvedValueOnce(
      new Response('', {
        headers: new Headers({ [SESSION_HEADER]: sessionId }),
      }),
    );
    await capturedFetch('http://muster/mcp', { method: 'POST' });
    mockLogger.debug.mockClear();

    // Same session ID in second response
    mockFetch.mockResolvedValueOnce(
      new Response('', {
        headers: new Headers({ [SESSION_HEADER]: sessionId }),
      }),
    );
    await capturedFetch('http://muster/mcp', { method: 'POST' });

    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('updates session ID when response provides a new one', async () => {
    createSessionAwareTransport({
      url: 'http://muster/mcp',
      sessionHeader: SESSION_HEADER,
      logger: mockLogger,
    });

    // First response
    mockFetch.mockResolvedValueOnce(
      new Response('', {
        headers: new Headers({ [SESSION_HEADER]: 'session-1' }),
      }),
    );
    await capturedFetch('http://muster/mcp', { method: 'POST' });

    // Second response with new session ID
    mockFetch.mockResolvedValueOnce(
      new Response('', {
        headers: new Headers({ [SESSION_HEADER]: 'session-2' }),
      }),
    );
    await capturedFetch('http://muster/mcp', { method: 'POST' });

    // Third request should use the latest session ID
    mockFetch.mockResolvedValueOnce(
      new Response('', { headers: new Headers() }),
    );
    await capturedFetch('http://muster/mcp', { method: 'POST' });

    const [, thirdInit] = mockFetch.mock.calls[2];
    const headers = new Headers(thirdInit.headers);
    expect(headers.get(SESSION_HEADER)).toBe('session-2');
  });
});
