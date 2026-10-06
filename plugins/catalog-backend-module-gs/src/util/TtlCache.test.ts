import { TtlCache } from './TtlCache';

describe('TtlCache', () => {
  it('runs a lookup once within the TTL', async () => {
    const cache = new TtlCache<string>(60_000);
    const fill = jest.fn().mockResolvedValue('value');

    await cache.get('k', fill);
    await cache.get('k', fill);

    expect(fill).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight promise between concurrent callers', async () => {
    const cache = new TtlCache<string>(60_000);
    const fill = jest.fn().mockResolvedValue('value');

    await Promise.all([cache.get('k', fill), cache.get('k', fill)]);

    expect(fill).toHaveBeenCalledTimes(1);
  });

  it('reports when the lookup ran, not when it was read', async () => {
    const cache = new TtlCache<string>(60_000);

    const first = await cache.get('k', async () => 'value');
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await cache.get('k', async () => 'value');

    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it('does not cache a rejected fill', async () => {
    const cache = new TtlCache<string>(60_000);
    const fill = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('value');

    await expect(cache.get('k', fill)).rejects.toThrow('transient');
    await expect(cache.get('k', fill)).resolves.toMatchObject({
      value: 'value',
    });
    expect(fill).toHaveBeenCalledTimes(2);
  });

  it('refetches once the TTL has passed', async () => {
    const cache = new TtlCache<string>(1);
    const fill = jest.fn().mockResolvedValue('value');

    await cache.get('k', fill);
    await new Promise(resolve => setTimeout(resolve, 5));
    await cache.get('k', fill);

    expect(fill).toHaveBeenCalledTimes(2);
  });

  it('drops expired entries so the key set stays bounded', async () => {
    // The tag cache is keyed registry/repository:tag, so every new release of a
    // flagged component adds a key that is never looked up again.
    const cache = new TtlCache<string>(1);

    for (let i = 0; i < 20; i++) {
      await cache.get(`tag-${i}`, async () => 'absent');
      await new Promise(resolve => setTimeout(resolve, 2));
    }

    // Each fill sweeps what has expired, so only the newest entry survives.
    expect(cache.size).toBeLessThanOrEqual(2);
  });

  it('keeps entries that are still within the TTL', async () => {
    const cache = new TtlCache<string>(60_000);

    await cache.get('a', async () => 'value');
    await cache.get('b', async () => 'value');
    await cache.get('c', async () => 'value');

    expect(cache.size).toBe(3);
  });
});
