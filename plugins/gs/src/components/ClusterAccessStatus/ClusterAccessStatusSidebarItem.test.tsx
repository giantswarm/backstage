import { fireEvent, screen, waitFor } from '@testing-library/react';
import { errorApiRef } from '@backstage/core-plugin-api';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  ClusterAccessStatusApi,
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
} from '../../apis/clusterAccessStatus';
import {
  mutedInstallationsApiRef,
  MutedInstallationsStore,
} from '../../apis/mutedInstallations';
import { gsAuthApiRef } from '../../apis/auth/types';
import {
  ClusterAccessStatusSidebarItem,
  summarize,
} from './ClusterAccessStatusSidebarItem';

function entry(
  installation: string,
  state: ClusterAccessStatusEntry['state'],
  reason?: string,
): ClusterAccessStatusEntry {
  return { installation, state, reason, lastChecked: 0 };
}

function fakeStatusApi(
  snapshot: ClusterAccessStatusEntry[],
): ClusterAccessStatusApi {
  return {
    getSnapshot: () => snapshot,
    status$: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
    recordConnecting() {},
    recordHealthy() {},
    recordDegraded() {},
    recordSessionExpired() {},
    remove() {},
  } as unknown as ClusterAccessStatusApi;
}

async function renderSidebar({
  entries = [],
  muted = [],
}: {
  entries?: ClusterAccessStatusEntry[];
  muted?: string[];
}) {
  const mutedStore = MutedInstallationsStore.create();
  muted.forEach(name => mutedStore.setMuted(name, true));

  await renderInTestApp(
    <TestApiProvider
      apis={[
        [clusterAccessStatusApiRef, fakeStatusApi(entries)],
        [mutedInstallationsApiRef, mutedStore],
        [gsAuthApiRef, { signIn: jest.fn() } as any],
        [errorApiRef, { post: jest.fn(), error$: jest.fn() } as any],
      ]}
    >
      <ClusterAccessStatusSidebarItem />
    </TestApiProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: /cluster access/i }));
  return { mutedStore };
}

describe('summarize', () => {
  it('collapses to a single muted part when everything is healthy', () => {
    const parts = summarize([
      entry('a', 'healthy'),
      entry('b', 'healthy'),
      entry('c', 'healthy'),
    ]);

    expect(parts).toEqual([
      { key: 'healthy', label: 'All 3 healthy', muted: true },
    ]);
  });

  it('lists non-empty states worst-first with healthy muted', () => {
    const parts = summarize([
      entry('a', 'healthy'),
      entry('b', 'degraded', 'Access forbidden'),
      entry('c', 'healthy'),
      entry('d', 'session-expired'),
    ]);

    expect(parts).toEqual([
      { key: 'session-expired', label: '1 session expired', muted: false },
      { key: 'degraded', label: '1 degraded', muted: false },
      { key: 'healthy', label: '2 healthy', muted: true },
    ]);
  });

  it('omits states with a zero count', () => {
    const parts = summarize([entry('a', 'connecting'), entry('b', 'degraded')]);

    expect(parts.map(p => p.key)).toEqual(['degraded', 'connecting']);
  });
});

describe('ClusterAccessStatusSidebarItem', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('lists accessed installations with an on toggle', async () => {
    await renderSidebar({ entries: [entry('alpha', 'healthy')] });

    expect(screen.getByText('alpha')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', {
      name: 'Enable installation alpha',
    });
    expect(toggle).toBeChecked();
  });

  it('lists a muted installation (not probed) as an off row', async () => {
    // gremlin is muted, so it has no status entry but must still be listed.
    await renderSidebar({
      entries: [entry('alpha', 'healthy')],
      muted: ['gremlin'],
    });

    expect(screen.getByText('gremlin')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Enable installation gremlin' }),
    ).not.toBeChecked();
  });

  it('mutes an installation when its toggle is switched off', async () => {
    const { mutedStore } = await renderSidebar({
      entries: [entry('alpha', 'healthy')],
    });

    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable installation alpha' }),
    );

    await waitFor(() => expect(mutedStore.isMuted('alpha')).toBe(true));
  });
});
