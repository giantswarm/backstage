import { UsageCache, usageCacheKey, USAGE_CACHE_TTL_MS } from './usageCache';

const key = (overrides: Partial<Parameters<typeof usageCacheKey>[0]> = {}) =>
  usageCacheKey({
    route: 'usage',
    installation: 'graveler',
    hours: 720,
    servers: [],
    userEntityRef: 'user:default/ada',
    ...overrides,
  });

describe('usageCacheKey', () => {
  it('is one key for the same servers in any order or repeated', () => {
    expect(key({ servers: ['b', 'a', 'b'] })).toBe(
      key({ servers: ['a', 'b'] }),
    );
  });

  it.each([
    ['route', { route: 'tool-latency' }],
    ['installation', { installation: 'garm' }],
    ['window', { hours: 168 }],
    ['servers', { servers: ['kagi'] }],
    ['tool', { tool: 'x_kagi_search' }],
    ['user', { userEntityRef: 'user:default/grace' }],
  ])('tells reads apart by %s', (_name, overrides) => {
    expect(key(overrides)).not.toBe(key());
  });
});

describe('UsageCache', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reuses an answer until the TTL has passed', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const cache = new UsageCache<{ n: number }>();
    let loads = 0;
    const load = jest.fn(async () => {
      loads += 1;
      return { n: loads };
    });

    const first = await cache.read('k', load, () => true);
    now = USAGE_CACHE_TTL_MS - 1;
    expect(await cache.read('k', load, () => true)).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);

    now = USAGE_CACHE_TTL_MS;
    expect(await cache.read('k', load, () => true)).toEqual({ n: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('runs one load for concurrent reads of a key', async () => {
    const cache = new UsageCache<string>();
    let resolve: (value: string) => void = () => {};
    const load = jest.fn(
      () =>
        new Promise<string>(r => {
          resolve = r;
        }),
    );

    const reads = [
      cache.read('k', load, () => true),
      cache.read('k', load, () => true),
    ];
    resolve('answer');

    expect(await Promise.all(reads)).toEqual(['answer', 'answer']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps an answer `keep` refuses only for the reads already waiting on it', async () => {
    const cache = new UsageCache<{ available: boolean }>();
    const load = jest.fn(async () => ({ available: false }));

    await cache.read('k', load, answer => answer.available);
    await cache.read('k', load, answer => answer.available);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stores no failure, and gives every waiter its error', async () => {
    const cache = new UsageCache<string>();
    const load = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('mimir 504'))
      .mockResolvedValueOnce('answer');

    const reads = [
      cache.read('k', load, () => true),
      cache.read('k', load, () => true),
    ];
    await expect(reads[0]).rejects.toThrow('mimir 504');
    await expect(reads[1]).rejects.toThrow('mimir 504');

    expect(await cache.read('k', load, () => true)).toBe('answer');
  });

  it('shares nothing without a key', async () => {
    const cache = new UsageCache<string>();
    const load = jest.fn(async () => 'answer');

    await cache.read(undefined, load, () => true);
    await cache.read(undefined, load, () => true);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads again after an answer was forgotten', async () => {
    const cache = new UsageCache<string>();
    const load = jest.fn(async () => 'answer');

    await cache.read('k', load, () => true);
    cache.forget('k');
    await cache.read('k', load, () => true);

    expect(load).toHaveBeenCalledTimes(2);
  });
});
