import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  __resetInstallationScopeForTests,
  ALL_INSTALLATIONS,
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_STORAGE_KEY,
  setInstallationScope,
} from './installationScopeStore';
import { useInstallationScopeUrlSync } from './useInstallationScopeUrlSync';

let navigate: ReturnType<typeof useNavigate>;

function Probe() {
  useInstallationScopeUrlSync();
  const { pathname, search } = useLocation();
  navigate = useNavigate();
  return <div data-testid="url">{`${pathname}${search}`}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId('url').textContent;

describe('useInstallationScopeUrlSync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetInstallationScopeForTests();
  });

  it('adopts the parameter of a deep link into the store', () => {
    renderAt('/agent-platform/agents?installation=wombat');

    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'wombat',
      restored: false,
    });
    expect(url()).toBe('/agent-platform/agents?installation=wombat');
  });

  it('leaves the URL alone under all', () => {
    renderAt('/agent-platform/agents?foo=bar');

    expect(url()).toBe('/agent-platform/agents?foo=bar');
    expect(getInstallationScopeSnapshot().scope).toBe(ALL_INSTALLATIONS);
  });

  it('writes a pinned installation into the URL, keeping other parameters', () => {
    renderAt('/agent-platform/agents?foo=bar');

    act(() => setInstallationScope('wombat'));

    expect(url()).toBe('/agent-platform/agents?foo=bar&installation=wombat');
  });

  it('removes the parameter when the scope goes back to all', () => {
    renderAt('/agent-platform/agents?installation=wombat');

    act(() => setInstallationScope(ALL_INSTALLATIONS));

    expect(url()).toBe('/agent-platform/agents');
    expect(getInstallationScopeSnapshot().scope).toBe(ALL_INSTALLATIONS);
  });

  it('keeps the pin when a link drops the parameter (a tab switch)', () => {
    renderAt('/agent-platform/agents?installation=wombat');

    act(() => navigate('/agent-platform/sessions'));

    expect(getInstallationScopeSnapshot().scope).toBe('wombat');
    expect(url()).toBe('/agent-platform/sessions?installation=wombat');
  });

  it('follows a parameter that changes under it (back button, another picker)', () => {
    renderAt('/agent-platform/agents?installation=wombat');

    act(() => navigate('/agent-platform/agents?installation=golem'));

    expect(getInstallationScopeSnapshot().scope).toBe('golem');
  });

  it('does not write a merely restored value until it is confirmed', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');

    renderAt('/agent-platform/agents');

    // Still `restored`: useInstallationScope decides whether that is a pin or
    // the muster picker's old default once the home is known.
    expect(url()).toBe('/agent-platform/agents');
    expect(getInstallationScopeSnapshot().restored).toBe(true);

    act(() => setInstallationScope('golem'));

    expect(url()).toBe('/agent-platform/agents?installation=golem');
  });

  it('lets a deep link win over a restored value', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');

    renderAt('/agent-platform/agents?installation=wombat');

    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'wombat',
      restored: false,
    });
  });
});
