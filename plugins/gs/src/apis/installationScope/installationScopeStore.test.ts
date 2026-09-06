import {
  __resetInstallationScopeForTests,
  ALL_INSTALLATIONS,
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_STORAGE_KEY,
  readStoredInstallationScope,
  setInstallationScope,
  subscribeInstallationScope,
} from './installationScopeStore';

describe('installationScopeStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetInstallationScopeForTests();
  });

  it('defaults to all installations when nothing is stored', () => {
    expect(readStoredInstallationScope()).toBe(ALL_INSTALLATIONS);
    expect(getInstallationScopeSnapshot()).toEqual({
      scope: ALL_INSTALLATIONS,
      restored: true,
    });
  });

  it('restores the installation the muster picker stored under its key', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');

    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'golem',
      restored: true,
    });
  });

  it('pins an installation, persists it and notifies subscribers', () => {
    const listener = jest.fn();
    subscribeInstallationScope(listener);

    setInstallationScope('wombat');

    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'wombat',
      restored: false,
    });
    expect(window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY)).toBe(
      'wombat',
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('removes the stored choice when the scope goes back to all', () => {
    setInstallationScope('wombat');
    setInstallationScope(ALL_INSTALLATIONS);

    expect(
      window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY),
    ).toBeNull();
    expect(getInstallationScopeSnapshot().scope).toBe(ALL_INSTALLATIONS);
  });

  it('keeps the snapshot identity and stays quiet when nothing changes', () => {
    const listener = jest.fn();
    setInstallationScope('wombat');
    const before = getInstallationScopeSnapshot();
    subscribeInstallationScope(listener);

    setInstallationScope('wombat');

    expect(getInstallationScopeSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('confirms a restored value: same scope, no longer restored', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');
    const listener = jest.fn();
    subscribeInstallationScope(listener);

    setInstallationScope('golem');

    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'golem',
      restored: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeInstallationScope(listener);
    unsubscribe();

    setInstallationScope('wombat');

    expect(listener).not.toHaveBeenCalled();
  });
});
