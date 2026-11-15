import { useSyncExternalStore } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, within } from '@testing-library/react';
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

// The real shared state labels and tones; the stores and the sign-in reduced
// to test doubles.
jest.mock('@giantswarm/backstage-plugin-gs', () => {
  const actual = jest.requireActual('@giantswarm/backstage-plugin-gs');
  const { createApiRef } = jest.requireActual('@backstage/frontend-plugin-api');
  return {
    CLUSTER_ACCESS_OFF_LABEL: actual.CLUSTER_ACCESS_OFF_LABEL,
    CLUSTER_ACCESS_STATE_LABELS: actual.CLUSTER_ACCESS_STATE_LABELS,
    CLUSTER_ACCESS_STATE_ORDER: actual.CLUSTER_ACCESS_STATE_ORDER,
    CLUSTER_ACCESS_STATE_TONES: actual.CLUSTER_ACCESS_STATE_TONES,
    CLUSTER_ACCESS_SUMMARY_LABELS: actual.CLUSTER_ACCESS_SUMMARY_LABELS,
    showsAccessReason: actual.showsAccessReason,
    mutedInstallationsApiRef: createApiRef({ id: 'test.muted' }),
    useSignInAgain: () => mockSignIn,
    useMutedInstallations: () =>
      useSyncExternalStore(mockMuted.subscribe, mockMuted.get),
    useClusterAccessStatus: () =>
      useSyncExternalStore(mockEntries.subscribe, mockEntries.get),
  };
});

const gs = jest.requireMock('@giantswarm/backstage-plugin-gs');

function entry(
  installation: string,
  state: ClusterAccessStatusEntry['state'],
  reason?: string,
): ClusterAccessStatusEntry {
  return { installation, state, reason, lastChecked: 0 };
}

async function renderToggles(
  installations: (string | { name: string; pipeline?: string })[],
) {
  await renderInTestApp(
    <EnvironmentToggles
      installations={installations.map(item =>
        typeof item === 'string' ? { name: item } : item,
      )}
    />,
    { apis: [[gs.mutedInstallationsApiRef, mockMutedApi]] as never },
  );
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
  mockSignIn.mockClear();
});

describe('EnvironmentToggles', () => {
  it('shows every environment as a toggle with the shared state labels, counting health among the ones on', async () => {
    mockMuted.set(['dingo', 'elver']);
    mockEntries.set([
      entry('alba', 'healthy'),
      entry('dingo', 'healthy'),
      entry('gazelle', 'healthy'),
      entry('glean', 'degraded', 'Access forbidden'),
    ]);
    await renderToggles([
      { name: 'alba', pipeline: 'stable' },
      'dingo',
      'elver',
      'gazelle',
      'glean',
    ]);

    expect(chip('alba (stable), Healthy')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(chip('alba (stable), Healthy').closest('li')).toHaveAttribute(
      'title',
      'Environment alba (stable). Healthy.',
    );
    // Off is not probed: no health, even with a stale probe result.
    const dingo = chip('dingo, Off');
    expect(dingo).toHaveAttribute('aria-pressed', 'false');
    expect(dingo.closest('li')).toHaveAttribute(
      'title',
      'Environment dingo. Off: the portal does not check or read it.',
    );
    expect(dingo.querySelector('[data-tone="neutral"]')).not.toHaveAttribute(
      'data-ring',
    );
    const glean = chip('glean, Degraded: Access forbidden');
    expect(glean).toHaveAttribute('aria-pressed', 'true');
    expect(glean.querySelector('[data-tone="warning"]')).toHaveAttribute(
      'data-ring',
      'true',
    );

    expect(summary()).toBe('3 of 5 on1 degraded2 healthy');
  });

  it('lists the reason of each environment that needs attention under the chips', async () => {
    mockEntries.set([
      entry('alba', 'healthy'),
      entry('glean', 'degraded', 'API unreachable (timeout)'),
      entry('grizzly', 'session-expired'),
    ]);
    await renderToggles([
      'alba',
      { name: 'glean', pipeline: 'testing' },
      'grizzly',
    ]);

    const list = screen.getByRole('list', {
      name: 'Environments that need attention',
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual([
      'glean (testing): Degraded, API unreachable (timeout)',
      'grizzly: Session expired',
    ]);
  });

  it('shows no attention list while nothing needs it', async () => {
    mockEntries.set([entry('alba', 'healthy')]);
    await renderToggles(['alba']);

    expect(
      screen.queryByRole('list', { name: 'Environments that need attention' }),
    ).toBeNull();
  });

  it('labels the states the access probe has not settled, and counts no healthy ones', async () => {
    mockEntries.set([entry('alba', 'connecting')]);
    await renderToggles(['alba', 'cedar']);

    expect(chip('alba, Connecting…')).toBeInTheDocument();
    expect(chip('cedar, Not checked')).toBeInTheDocument();
    expect(summary()).toBe('2 of 2 on1 connecting1 not checked');
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

    await userEvent.click(chip('alba, Healthy'));
    expect(mockMutedApi.setMutedMany).toHaveBeenLastCalledWith(['alba'], true);
    expect(chip('alba, Off')).toHaveAttribute('aria-pressed', 'false');
    expect(summary()).toBe('1 of 2 on1 not checked');

    await userEvent.click(chip('alba, Off'));
    expect(mockMutedApi.setMutedMany).toHaveBeenLastCalledWith(['alba'], false);
    expect(chip('alba, Healthy')).toHaveAttribute('aria-pressed', 'true');
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

  it('drops the Undo once an environment is turned on elsewhere', async () => {
    await renderToggles(['alba', 'cedar']);
    await userEvent.click(screen.getByRole('button', { name: 'All off' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

    // Another tab, or the classic widget, turns one on and off again.
    act(() => mockMuted.set(['alba']));
    act(() => mockMuted.set(['alba', 'cedar']));

    expect(screen.getByText(/All environments are off/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('offers no Undo when everything was already off', async () => {
    mockMuted.set(['alba']);
    await renderToggles(['alba']);

    expect(screen.getByText(/All environments are off/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('offers the shared Sign in again while a session has expired', async () => {
    mockEntries.set([
      entry('alba', 'session-expired', 'Your session expired'),
      entry('cedar', 'healthy'),
    ]);
    await renderToggles(['alba', 'cedar']);

    expect(
      chip('alba, Session expired: Your session expired'),
    ).toBeInTheDocument();
    expect(summary()).toBe('2 of 2 on1 session expired1 healthy');
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
