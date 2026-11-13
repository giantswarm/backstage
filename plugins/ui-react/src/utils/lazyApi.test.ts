import { lazyApi } from './lazyApi';

class Counter {
  private count = 0;

  async increment(by: number): Promise<number> {
    this.count += by;
    return this.count;
  }
}

describe('lazyApi', () => {
  it('loads on the first call, once, and keeps the instance', async () => {
    const load = jest.fn(async () => new Counter());
    const api = lazyApi(load);

    expect(load).not.toHaveBeenCalled();
    await expect(api.increment(2)).resolves.toBe(2);
    await expect(api.increment(3)).resolves.toBe(5);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads once for concurrent first calls', async () => {
    const load = jest.fn(async () => new Counter());
    const api = lazyApi(load);

    await Promise.all([api.increment(1), api.increment(1)]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries a failed load on the next call', async () => {
    const load = jest
      .fn<Promise<Counter>, []>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValue(new Counter());
    const api = lazyApi(load);

    await expect(api.increment(1)).rejects.toThrow('chunk failed');
    await expect(api.increment(1)).resolves.toBe(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('answers a method name with the same function every time', () => {
    const api = lazyApi(async () => new Counter());

    expect(api.increment).toBe(api.increment);
  });

  it('is not a thenable', async () => {
    const api = lazyApi(async () => new Counter());

    expect((api as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(api)).resolves.toBe(api);
  });

  it('converts, serializes and compares like a plain object', () => {
    const api = lazyApi(async () => new Counter());

    expect(String(api)).toBe('[object Object]');
    expect(JSON.stringify(api)).toBe('{}');
    expect(`${api}`).toBe('[object Object]');
    // Not an asymmetric matcher: Jest compares it as an empty object.
    expect(api).toEqual({});
  });

  it('refuses an API with optional methods in its type', () => {
    interface Optional {
      get(): Promise<string>;
      maybe?(): Promise<string>;
    }
    const load = async (): Promise<Optional> => ({ get: async () => 'x' });

    // @ts-expect-error optional members cannot be told apart before loading
    expect(lazyApi(load)).toBeDefined();
  });
});
