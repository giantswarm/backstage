import { McpClientCache, isClosedClientError } from './McpClientCache';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as any;

interface FakeTransport {
  onclose?: (...args: unknown[]) => void;
}

interface FakeClient {
  id: number;
  transport: FakeTransport;
  close: jest.Mock;
}

function makeFakeClient(id: number): FakeClient {
  const transport: FakeTransport = {};
  return {
    id,
    transport,
    close: jest.fn().mockResolvedValue(undefined),
  };
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

describe('McpClientCache', () => {
  let cache: McpClientCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new McpClientCache(mockLogger, {
      ttlMs: 60_000,
      sweepIntervalMs: 60_000,
    });
  });

  afterEach(async () => {
    await cache.dispose();
  });

  it('returns the same client for repeated getOrCreate while alive', async () => {
    const factory = jest.fn(async () => makeFakeClient(1) as any);
    const a = await cache.getOrCreate('k', factory);
    const b = await cache.getOrCreate('k', factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('rebuilds when the underlying transport fires onclose', async () => {
    const clients = [makeFakeClient(1), makeFakeClient(2)];
    const factory = jest
      .fn()
      .mockImplementationOnce(async () => clients[0] as any)
      .mockImplementationOnce(async () => clients[1] as any);

    const first = await cache.getOrCreate('k', factory);
    expect(first).toBe(clients[0]);
    expect(typeof clients[0].transport.onclose).toBe('function');

    clients[0].transport.onclose!();

    const second = await cache.getOrCreate('k', factory);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(second).toBe(clients[1]);
    expect(second).not.toBe(first);
  });

  it('chains an existing transport.onclose handler', async () => {
    const previous = jest.fn();
    const client = makeFakeClient(1);
    client.transport.onclose = previous;
    const factory = jest.fn(async () => client as any);

    await cache.getOrCreate('k', factory);
    client.transport.onclose!('arg');

    expect(previous).toHaveBeenCalledWith('arg');
  });

  it('markDead forces a rebuild on the next getOrCreate', async () => {
    const clients = [makeFakeClient(1), makeFakeClient(2)];
    const factory = jest
      .fn()
      .mockImplementationOnce(async () => clients[0] as any)
      .mockImplementationOnce(async () => clients[1] as any);

    await cache.getOrCreate('k', factory);
    cache.markDead('k');
    const next = await cache.getOrCreate('k', factory);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(next).toBe(clients[1]);
  });

  it('removes the entry when the factory rejects so the next call retries', async () => {
    const success = makeFakeClient(2);
    const factory = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(success as any);

    await expect(cache.getOrCreate('k', factory)).rejects.toThrow('boom');
    const second = await cache.getOrCreate('k', factory);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(second).toBe(success);
  });
});
