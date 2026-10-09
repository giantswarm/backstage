import type { ReactNode } from 'react';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { StorageApi, storageApiRef } from '@backstage/core-plugin-api';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KagentSession } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../../apis';
import { KagentApi } from '../../apis/types';
import { sessionsRouteRef } from '../../routes';
import { RecentSessions } from './RecentSessions';
import { pickRecentSessions, railSessionGroup } from './helpers';
import type { SessionRow } from '../SessionsDataProvider';

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  applyInstallationScope: (installations: string[]) => installations,
  useInstallations: () => ({
    installations: [{ name: 'gazelle' }],
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    entries: [],
    isLoading: false,
    isProbing: false,
    installationsWith: (component: string) =>
      component === 'kagent' ? ['gazelle'] : [],
    refresh: () => {},
  }),
  useInstallationScope: () => ({
    scope: 'all',
    setScope: () => {},
    installations: [],
    isSingleInstallation: false,
    isLoading: false,
  }),
}));

let mockQueryClient: QueryClient;

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={mockQueryClient}>
      {children}
    </QueryClientProvider>
  ),
}));

jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => children,
  useAgents: () => ({ rows: [] }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilitiesMap: () => () => ({}),
}));

const listSessions = jest.fn();
const listSessionStates = jest.fn();
const listInstallations = jest
  .fn()
  .mockResolvedValue([{ name: 'gazelle', reachable: true }]);

const kagentApi = {
  listSessions,
  listSessionStates,
  listInstallations,
  getIdentity: jest.fn(),
} as unknown as KagentApi;

function session(id: string, createdAt: string, title: string): KagentSession {
  return {
    id: `gazelle/${id}`,
    sessionId: id,
    installation: 'gazelle',
    title,
    agentId: 'agent_platform__NS__pr_reviewer',
    createdAt,
    updatedAt: createdAt,
  } as KagentSession;
}

function renderRecent(
  options: {
    mounted?: boolean;
    path?: string;
    shellRail?: boolean;
    limit?: number;
    storage?: StorageApi;
  } = {},
) {
  const {
    mounted = true,
    path = '/',
    shellRail,
    limit = 2,
    storage = mockApis.storage(),
  } = options;
  return renderInTestApp(
    <RecentSessions limit={limit} shellRail={shellRail} />,
    {
      apis: [
        [kagentApiRef, kagentApi],
        [storageApiRef, storage],
      ],
      initialRouteEntries: [path],
      ...(mounted && {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      }),
    },
  );
}

/** A storage bucket pre-seeded with pinned sessions. */
async function storageWithPins(sessionIds: string[]) {
  const storage = mockApis.storage();
  await storage.forBucket('agent-platform').set(
    'pinnedSessions',
    sessionIds.map(sessionId => ({ installation: 'gazelle', sessionId })),
  );
  return storage;
}

beforeEach(() => {
  mockQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  listSessions.mockReset();
  listSessionStates.mockReset();
  listInstallations.mockClear();
  listSessions.mockResolvedValue([
    session('old', '2026-07-20T10:00:00Z', 'Oldest'),
    session('new', '2026-07-23T10:00:00Z', 'Newest'),
    session('mid', '2026-07-22T10:00:00Z', 'Middle'),
  ]);
  listSessionStates.mockResolvedValue({
    evaluatedAt: 0,
    states: [
      { sessionId: 'mid', state: 'input-required' },
      { sessionId: 'new', state: 'working' },
    ],
    unreadable: [],
    skipped: 0,
  });
});

describe('RecentSessions', () => {
  it('lists the most recently started sessions, newest first, linked to their detail page', async () => {
    await renderRecent();

    const list = await screen.findByRole('list', { name: 'Recent' });
    const links = await within(list).findAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/agent-platform/sessions/gazelle/new',
      '/agent-platform/sessions/gazelle/mid',
    ]);
    expect(within(list).queryByText('Oldest')).not.toBeInTheDocument();
  });

  it('labels the list without a heading of its own', async () => {
    await renderRecent();

    expect(await screen.findByRole('list', { name: 'Recent' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Recent' }),
    ).not.toBeInTheDocument();
  });

  it('marks the sessions waiting for input', async () => {
    await renderRecent();

    const middle = (await screen.findByText('Middle')).closest('a');
    expect(middle).not.toBeNull();
    expect(
      await within(middle as HTMLElement).findByText('Needs you'),
    ).toBeInTheDocument();
    const newest = screen.getByText('Newest').closest('a') as HTMLElement;
    expect(within(newest).queryByText('Needs you')).not.toBeInTheDocument();
  });

  it('marks the session open at the current location', async () => {
    await renderRecent({ path: '/agent-platform/sessions/gazelle/mid' });

    const middle = (await screen.findByText('Middle')).closest('a');
    expect(middle).toHaveAttribute('aria-current', 'page');
    const newest = screen.getByText('Newest').closest('a');
    expect(newest).not.toHaveAttribute('aria-current');
  });

  it('has no All sessions link and no working dot outside the shell rail', async () => {
    await renderRecent();

    await screen.findByText('Middle');
    expect(
      screen.queryByRole('link', { name: 'All sessions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Working' }),
    ).not.toBeInTheDocument();
  });

  describe('in the shell rail', () => {
    it('links to all sessions next to the list label', async () => {
      await renderRecent({ shellRail: true });

      const link = await screen.findByRole('link', { name: 'All sessions' });
      expect(link).toHaveAttribute('href', '/agent-platform/sessions');
      expect(link).not.toHaveAttribute('aria-current');
    });

    it('marks All sessions current on the sessions list', async () => {
      await renderRecent({ shellRail: true, path: '/agent-platform/sessions' });

      expect(
        await screen.findByRole('link', { name: 'All sessions' }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('puts a dot before the sessions whose agent is working', async () => {
      await renderRecent({ shellRail: true });

      const newest = (await screen.findByText('Newest')).closest(
        'a',
      ) as HTMLElement;
      expect(
        await within(newest).findByRole('img', { name: 'Working' }),
      ).toBeInTheDocument();
      const middle = screen.getByText('Middle').closest('a') as HTMLElement;
      expect(
        within(middle).queryByRole('img', { name: 'Working' }),
      ).not.toBeInTheDocument();
      expect(within(middle).getByText('Needs you')).toBeInTheDocument();
    });

    it('groups the sessions under the prototype’s time headings', async () => {
      const now = Date.now();
      const daysAgo = (days: number) =>
        new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
      listSessions.mockResolvedValue([
        session('t', new Date(now).toISOString(), 'Fresh'),
        session('w', daysAgo(3), 'This week'),
        session('e', daysAgo(20), 'Long ago'),
      ]);

      await renderRecent({ shellRail: true, limit: 8 });

      const today = await screen.findByRole('list', { name: 'Today' });
      expect(within(today).getByText('Fresh')).toBeInTheDocument();
      const week = screen.getByRole('list', { name: 'Previous 7 days' });
      expect(within(week).getByText('This week')).toBeInTheDocument();
      const earlier = screen.getByRole('list', { name: 'Earlier' });
      expect(within(earlier).getByText('Long ago')).toBeInTheDocument();
    });

    it('leads with the pinned sessions, without repeating them below', async () => {
      await renderRecent({
        shellRail: true,
        limit: 8,
        storage: await storageWithPins(['old']),
      });

      const pinned = await screen.findByRole('list', { name: 'Pinned' });
      expect(within(pinned).getByText('Oldest')).toBeInTheDocument();
      // Only once: the pinned session does not repeat in the time groups.
      expect(screen.getAllByText('Oldest')).toHaveLength(1);
      expect(screen.getByText('Newest')).toBeInTheDocument();
    });

    it('shows the pinned sessions’ status like any other row', async () => {
      listSessionStates.mockResolvedValue({
        evaluatedAt: 0,
        states: [{ sessionId: 'old', state: 'input-required' }],
        unreadable: [],
        skipped: 0,
      });

      await renderRecent({
        shellRail: true,
        storage: await storageWithPins(['old']),
      });

      const pinned = await screen.findByRole('list', { name: 'Pinned' });
      const row = (await within(pinned).findByText('Oldest')).closest(
        'a',
      ) as HTMLElement;
      expect(await within(row).findByText('Needs you')).toBeInTheDocument();
    });

    it('pins and unpins a session from its row', async () => {
      const user = userEvent.setup();
      const storage = mockApis.storage();
      await renderRecent({ shellRail: true, storage });

      await screen.findByText('Newest');
      await user.click(screen.getByRole('button', { name: 'Pin “Newest”' }));

      await waitFor(() =>
        expect(
          storage.forBucket('agent-platform').snapshot('pinnedSessions').value,
        ).toEqual([{ installation: 'gazelle', sessionId: 'new' }]),
      );
      const pinned = await screen.findByRole('list', { name: 'Pinned' });
      expect(within(pinned).getByText('Newest')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Unpin “Newest”' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('list', { name: 'Pinned' }),
        ).not.toBeInTheDocument(),
      );
    });
  });

  it('offers no pin affordance outside the shell rail', async () => {
    await renderRecent();

    await screen.findByText('Newest');
    expect(
      screen.queryByRole('button', { name: /Pin/ }),
    ).not.toBeInTheDocument();
  });

  it('says so when there is no session', async () => {
    listSessions.mockResolvedValue([]);

    await renderRecent();

    expect(await screen.findByText('No sessions yet')).toBeInTheDocument();
  });

  it('reads the sessions within the flush the unbound case waits out', async () => {
    await renderRecent();

    await act(() => new Promise(resolve => setTimeout(resolve, 100)));

    expect(listSessions).toHaveBeenCalledWith('gazelle');
  });

  it('renders nothing and reads nothing when the sessions route is not bound', async () => {
    await renderRecent({ mounted: false });

    // Long enough for the mounted case's fetch chain to reach listSessions.
    await act(() => new Promise(resolve => setTimeout(resolve, 100)));

    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    expect(listInstallations).not.toHaveBeenCalled();
    expect(listSessions).not.toHaveBeenCalled();
    expect(listSessionStates).not.toHaveBeenCalled();
  });
});

describe('pickRecentSessions', () => {
  const row = (id: string, createdAt?: string): SessionRow => ({
    id,
    sessionId: id,
    installation: 'gazelle',
    title: id,
    agentName: '',
    createdAt,
  });

  it('keeps the newest by start time and puts undated sessions last', () => {
    expect(
      pickRecentSessions(
        [
          row('undated'),
          row('a', '2026-07-01T00:00:00Z'),
          row('b', '2026-07-03T00:00:00Z'),
        ],
        3,
      ).map(r => r.id),
    ).toEqual(['b', 'a', 'undated']);
  });

  it('caps the list at the limit', () => {
    expect(
      pickRecentSessions(
        [row('a', '2026-07-01T00:00:00Z'), row('b', '2026-07-02T00:00:00Z')],
        1,
      ).map(r => r.id),
    ).toEqual(['b']);
  });
});

describe('railSessionGroup', () => {
  const now = new Date('2026-10-09T12:00:00');

  it.each([
    ['2026-10-09T00:00:00', 'today'],
    ['2026-10-10T08:00:00', 'today'], // clock skew counts as today
    ['2026-10-08T23:59:00', 'week'],
    ['2026-10-02T00:00:00', 'week'],
    ['2026-10-01T23:59:00', 'earlier'],
    [undefined, 'earlier'],
    ['not a date', 'earlier'],
  ])('buckets %s as %s', (createdAt, expected) => {
    expect(railSessionGroup(createdAt as string | undefined, now)).toBe(
      expected,
    );
  });
});
