import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KagentSession } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../../apis';
import { KagentApi } from '../../apis/types';
import { sessionsRouteRef } from '../../routes';
import { RecentSessions } from './RecentSessions';
import { pickRecentSessions } from './helpers';
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

function renderRecent(options: { mounted?: boolean; path?: string } = {}) {
  const { mounted = true, path = '/' } = options;
  return renderInTestApp(<RecentSessions limit={2} />, {
    apis: [[kagentApiRef, kagentApi]],
    initialRouteEntries: [path],
    ...(mounted && {
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    }),
  });
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
    states: [{ sessionId: 'mid', state: 'input-required' }],
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
