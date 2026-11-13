import { useSyncExternalStore } from 'react';
import { errorApiRef } from '@backstage/frontend-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClusterAccessStatusEntry } from '@giantswarm/backstage-plugin-gs';
import { EnvironmentToggles } from './EnvironmentToggles';

// The gs stores, reduced to what the toggles use: the switched-off set and the
// access probe's entries, each a tiny external store.
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach(listener => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const mockMuted = createStore<string[]>([]);
const mockEntries = createStore<ClusterAccessStatusEntry[]>([]);
const mockSignIn = jest.fn();
const mockMutedApi = {
  setMutedMany: jest.fn((names: string[], muted: boolean) => {
    const next = new Set(mockMuted.get());
    names.forEach(name => (muted ? next.add(name) : next.delete(name)));
    mockMuted.set([...next].sort());
  }),
};

jest.mock('@giantswarm/backstage-plugin-gs', () => {
  const { createApiRef } = jest.requireActual('@backstage/frontend-plugin-api');
  return {
    mutedInstallationsApiRef: createApiRef({ id: 'test.muted' }),
    gsAuthProvidersApiRef: createApiRef({ id: 'test.auth-providers' }),
    useMutedInstallations: () =>
      useSyncExternalStore(mockMuted.subscribe, mockMuted.get),
    useClusterAccessStatus: () =>
      useSyncExternalStore(mockEntries.subscribe, mockEntries.get),
  };
});

const gs = jest.requireMock('@giantswarm/backstage-plugin-gs');
const errorPost = jest.fn();

function entry(
  installation: string,
  state: ClusterAccessStatusEntry['state'],
  reason?: string,
): ClusterAccessStatusEntry {
  return { installation, state, reason, lastChecked: 0 };
}

async function renderToggles(installations: string[]) {
  await renderInTestApp(<EnvironmentToggles installations={installations} />, {
    apis: [
      [gs.mutedInstallationsApiRef, mockMutedApi],
      [
        gs.gsAuthProvidersApiRef,
        { getMainAuthApi: () => ({ signIn: mockSignIn }) },
      ],
      [errorApiRef, { post: errorPost, error$: jest.fn() }],
    ] as never,
  });
}

function chip(name: RegExp | string) {
  return screen.getByRole('button', { name });
}

function summary() {
  return screen.getByTestId('environments-summary').textContent;
}

beforeEach(() => {
  mockMuted.set([]);
  mockEntries.set([]);
  mockMutedApi.setMutedMany.mockClear();
  mockSignIn.mockReset().mockResolvedValue(undefined);
  errorPost.mockClear();
});

describe('EnvironmentToggles', () => {
  it('shows every environment as a toggle with its health, and counts health among the ones on', async () => {
    mockMuted.set(['dingo', 'elver']);
    mockEntries.set([
      entry('alba', 'healthy'),
      entry('gazelle', 'healthy'),
      entry('glean', 'degraded', 'API unreachable (timeout)'),
    ]);
    await renderToggles(['alba', 'dingo', 'elver', 'gazelle', 'glean']);

    expect(chip('alba, healthy')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('dingo, off')).toHaveAttribute('aria-pressed', 'false');
    const glean = chip('glean, unreachable: API unreachable (timeout)');
    expect(glean).toHaveAttribute('aria-pressed', 'true');
    expect(glean.closest('li')).toHaveAttribute(
      'title',
      'Unreachable: API unreachable (timeout).',
    );
    expect(glean.querySelector('[data-tone="danger"]')).toHaveAttribute(
      'data-ring',
      'true',
    );
    expect(
      chip('dingo, off').querySelector('[data-tone="neutral"]'),
    ).not.toHaveAttribute('data-ring');

    expect(summary()).toBe('3 of 5 on2 healthy1 unreachable');
  });

  it('labels the states the access check has not settled', async () => {
    mockEntries.set([entry('alba', 'connecting')]);
    await renderToggles(['alba', 'cedar']);

    expect(chip('alba, checking…')).toBeInTheDocument();
    expect(chip('cedar, not checked')).toBeInTheDocument();
    expect(summary()).toBe('2 of 2 on0 healthy1 checking…1 not checked');
  });

  it('renders every environment of a large fleet, with no reveal control', async () => {
    const names = Array.from(
      { length: 300 },
      (_, index) => `inst-${index + 1}`,
    );
    await renderToggles(names);

    const list = screen.getByRole('list', { name: 'Environments' });
    expect(within(list).getAllByRole('button')).toHaveLength(300);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('turns one environment off and on in the shared store', async () => {
    mockEntries.set([entry('alba', 'healthy')]);
    await renderToggles(['alba', 'cedar']);

    await userEvent.click(chip('alba, healthy'));
    expect(mockMutedApi.setMutedMany).toHaveBeenLastCalledWith(['alba'], true);
    expect(chip('alba, off')).toHaveAttribute('aria-pressed', 'false');
    expect(summary()).toBe('1 of 2 on0 healthy1 not checked');

    await userEvent.click(chip('alba, off'));
    expect(mockMutedApi.setMutedMany).toHaveBeenLastCalledWith(['alba'], false);
    expect(chip('alba, healthy')).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns all off with an Undo back to the previous selection, and all on', async () => {
    mockMuted.set(['cedar']);
    await renderToggles(['alba', 'cedar', 'dingo']);

    expect(screen.getByRole('button', { name: 'All on' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'All off' }));
    expect(screen.getByRole('button', { name: 'All off' })).toBeDisabled();
    expect(
      screen.getByText(
        'All environments are off, so the portal shows nothing. Turn on the ones you work with.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mockMuted.get()).toEqual(['cedar']);
    expect(screen.queryByText(/All environments are off/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'All on' }));
    expect(mockMuted.get()).toEqual([]);
    expect(screen.getByRole('button', { name: 'All on' })).toBeDisabled();
  });

  it('offers no Undo when everything was already off', async () => {
    mockMuted.set(['alba']);
    await renderToggles(['alba']);

    expect(screen.getByText(/All environments are off/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('offers Sign in again while a session has expired', async () => {
    mockEntries.set([
      entry('alba', 'session-expired', 'Your session expired'),
      entry('cedar', 'healthy'),
    ]);
    await renderToggles(['alba', 'cedar']);

    expect(
      chip('alba, session expired: Your session expired'),
    ).toBeInTheDocument();
    expect(summary()).toBe('2 of 2 on1 healthy1 session expired');
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again' }),
    );
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows no Sign in again while every session holds', async () => {
    mockEntries.set([entry('alba', 'healthy')]);
    await renderToggles(['alba']);

    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull();
  });
});
