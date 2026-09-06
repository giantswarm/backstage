import {
  LocalStorageSignInConnectorMemory,
  SIGN_IN_CONNECTOR_STORAGE_KEY,
} from './signInConnectorMemory';

describe('LocalStorageSignInConnectorMemory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('remembers nothing until a connector is recorded', () => {
    expect(new LocalStorageSignInConnectorMemory().get()).toBeUndefined();
  });

  it('round-trips the connector through localStorage under gs.auth.connector', () => {
    const memory = new LocalStorageSignInConnectorMemory();

    memory.remember('giantswarm-ad');

    expect(window.localStorage.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY)).toBe(
      'giantswarm-ad',
    );
    // A fresh instance (another tab, a reload) sees the same connector.
    expect(new LocalStorageSignInConnectorMemory().get()).toBe('giantswarm-ad');

    memory.forget();

    expect(memory.get()).toBeUndefined();
    expect(
      window.localStorage.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY),
    ).toBeNull();
  });

  it('degrades to remembering nothing when the storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const memory = new LocalStorageSignInConnectorMemory(throwing);

    expect(() => memory.remember('giantswarm-ad')).not.toThrow();
    expect(memory.get()).toBeUndefined();
    expect(() => memory.forget()).not.toThrow();
  });
});
