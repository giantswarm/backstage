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

  it('is not a thenable', async () => {
    const api = lazyApi(async () => new Counter());

    expect((api as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(api)).resolves.toBe(api);
  });
});
