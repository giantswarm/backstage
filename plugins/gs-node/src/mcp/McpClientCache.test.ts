import { McpClientCache } from './McpClientCache';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as any;

interface FakeTransport {
  onclose?: (...args: unknown[]) => void;
  onSessionExpired?: (...args: unknown[]) => void;
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

describe('McpClientCache session hooks and idle TTL', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rebuilds when the transport reports the session expired (404 on the id)', async () => {
    const cache = new McpClientCache(mockLogger, { sweepIntervalMs: 60_000 });
    const clients = [makeFakeClient(1), makeFakeClient(2)];
    const factory = jest.fn(async () => clients.shift() as any);

    const first = await cache.getOrCreate('k', factory);
    expect(typeof (first as any).transport.onSessionExpired).toBe('function');

    (first as any).transport.onSessionExpired('sess-1');

    const second = await cache.getOrCreate('k', factory);
    expect((second as any).id).toBe(2);
    expect(factory).toHaveBeenCalledTimes(2);
    await cache.dispose();
  });

  it('chains an existing transport.onSessionExpired handler', async () => {
    const cache = new McpClientCache(mockLogger, { sweepIntervalMs: 60_000 });
    const client = makeFakeClient(1);
    const previous = jest.fn();
    client.transport.onSessionExpired = previous;
    await cache.getOrCreate('k', async () => client as any);

    client.transport.onSessionExpired!('sess-1');
    expect(previous).toHaveBeenCalledWith('sess-1');
    await cache.dispose();
  });

  it('markDead with the client a caller failed on does not kill its replacement', async () => {
    const cache = new McpClientCache(mockLogger, { sweepIntervalMs: 60_000 });
    const clients = [makeFakeClient(1), makeFakeClient(2)];
    const factory = jest.fn(async () => clients.shift() as any);

    const stale = await cache.getOrCreate('k', factory);
    cache.markDead('k', stale);
    const fresh = await cache.getOrCreate('k', factory);
    expect((fresh as any).id).toBe(2);

    // A second caller that failed on the stale client arrives late.
    cache.markDead('k', stale);
    expect(await cache.getOrCreate('k', factory)).toBe(fresh);
    expect(factory).toHaveBeenCalledTimes(2);
    await cache.dispose();
  });

  it('recreates an entry idle for longer than the idle TTL, refreshed on every use', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const cache = new McpClientCache(mockLogger, {
      ttlMs: 60 * 60_000,
      idleTtlMs: 10 * 60_000,
      sweepIntervalMs: 60 * 60_000,
    });
    const clients = [makeFakeClient(1), makeFakeClient(2)];
    const factory = jest.fn(async () => clients.shift() as any);

    const first = await cache.getOrCreate('k', factory);
    jest.setSystemTime(1_000_000 + 9 * 60_000);
    expect(await cache.getOrCreate('k', factory)).toBe(first);
    jest.setSystemTime(1_000_000 + 18 * 60_000);
    expect(await cache.getOrCreate('k', factory)).toBe(first);

    jest.setSystemTime(1_000_000 + 29 * 60_000);
    const second = await cache.getOrCreate('k', factory);
    expect((second as any).id).toBe(2);
    expect(factory).toHaveBeenCalledTimes(2);
    await cache.dispose();
  });
});
