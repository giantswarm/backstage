import { ConfigReader } from '@backstage/config';
import {
  __resetSignedInConfigForTests,
  getSignedInConfig,
  getSignedInConfigSnapshot,
  setSignedInConfig,
  subscribeSignedInConfig,
} from './signedInConfig';

describe('signedInConfig source', () => {
  beforeEach(() => {
    __resetSignedInConfigForTests();
  });

  it('has no snapshot before it is published', () => {
    expect(getSignedInConfigSnapshot()).toBeUndefined();
  });

  it('resolves awaiters that asked before the config was published', async () => {
    const pending = getSignedInConfig();

    setSignedInConfig(new ConfigReader({ gs: { adminGroups: ['admins'] } }));

    const config = await pending;
    expect(config.getStringArray('gs.adminGroups')).toEqual(['admins']);
    expect(getSignedInConfigSnapshot()).toBe(config);
  });

  it('resolves immediately once published', async () => {
    const published = new ConfigReader({ gs: { adminGroups: [] } });
    setSignedInConfig(published);

    await expect(getSignedInConfig()).resolves.toBe(published);
  });

  it('notifies subscribers on publish and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSignedInConfig(listener);

    setSignedInConfig(new ConfigReader({}));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setSignedInConfig(new ConfigReader({}));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('replaces the value on a second publish', async () => {
    setSignedInConfig(new ConfigReader({ gs: { adminGroups: ['a'] } }));
    setSignedInConfig(new ConfigReader({ gs: { adminGroups: ['b'] } }));

    const config = await getSignedInConfig();
    expect(config.getStringArray('gs.adminGroups')).toEqual(['b']);
  });
});
