import { ConfigReader } from '@backstage/config';
import { setSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import {
  __resetInstallationsConfigForTests,
  getInstallationsConfig,
  getInstallationsConfigSnapshot,
  readInstallationsConfig,
  setInstallationsConfig,
  subscribeInstallationsConfig,
} from './installationsConfig';

describe('installationsConfig source', () => {
  beforeEach(() => {
    __resetInstallationsConfigForTests();
  });

  it('reads gs.installations of a signed-in config as a name-carrying array', () => {
    const config = new ConfigReader({
      gs: {
        installations: {
          golem: { pipeline: 'stable', baseDomain: 'golem.example.com' },
          gaggle: { pipeline: 'testing' },
        },
      },
    });

    expect(readInstallationsConfig(config)).toEqual([
      { name: 'golem', pipeline: 'stable', baseDomain: 'golem.example.com' },
      { name: 'gaggle', pipeline: 'testing' },
    ]);
    // The same config yields the same array: snapshots stay stable.
    expect(readInstallationsConfig(config)).toBe(
      readInstallationsConfig(config),
    );
  });

  it('reads a signed-in config without installations as none', () => {
    setSignedInConfig(new ConfigReader({ gs: { adminGroups: [] } }));

    expect(getInstallationsConfigSnapshot()).toEqual([]);
  });

  it('has no snapshot before the signed-in config is published', () => {
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
