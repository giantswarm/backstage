import {
  __resetInstallationsConfigForTests,
  getInstallationsConfig,
  getInstallationsConfigSnapshot,
  normalizeInstallationsConfig,
  setInstallationsConfig,
  subscribeInstallationsConfig,
} from './installationsConfig';

describe('installationsConfig source', () => {
  beforeEach(() => {
    __resetInstallationsConfigForTests();
  });

  it('normalizes the backend response into a name-carrying array', () => {
    const normalized = normalizeInstallationsConfig({
      golem: { pipeline: 'stable', baseDomain: 'golem.example.com' },
      gaggle: { pipeline: 'testing' },
    });

    expect(normalized).toEqual([
      { name: 'golem', pipeline: 'stable', baseDomain: 'golem.example.com' },
      { name: 'gaggle', pipeline: 'testing' },
    ]);
  });

  it('has no snapshot before it is populated', () => {
    expect(getInstallationsConfigSnapshot()).toBeUndefined();
  });

  it('resolves awaiters that subscribed before the value was set', async () => {
    const pending = getInstallationsConfig();

    setInstallationsConfig([{ name: 'golem', pipeline: 'stable' }]);

    await expect(pending).resolves.toEqual([
      { name: 'golem', pipeline: 'stable' },
    ]);
    expect(getInstallationsConfigSnapshot()).toEqual([
      { name: 'golem', pipeline: 'stable' },
    ]);
  });

  it('resolves immediately once already populated', async () => {
    setInstallationsConfig([{ name: 'gaggle', pipeline: 'testing' }]);

    await expect(getInstallationsConfig()).resolves.toEqual([
      { name: 'gaggle', pipeline: 'testing' },
    ]);
  });

  it('notifies subscribers on set and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeInstallationsConfig(listener);

    setInstallationsConfig([{ name: 'golem' }]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setInstallationsConfig([{ name: 'gaggle' }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
