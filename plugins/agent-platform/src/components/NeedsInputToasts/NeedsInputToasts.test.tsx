import type { ReactNode } from 'react';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { toastApiRef } from '@backstage/frontend-plugin-api';
import { storageApiRef } from '@backstage/core-plugin-api';
import { act, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KagentSession } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../../apis';
import { KagentApi } from '../../apis/types';
import { sessionsRouteRef } from '../../routes';
import { RecentSessions } from '../RecentSessions';
import { findNewlyWaiting } from './helpers';

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
const kagentApi = {
  listSessions,
  listSessionStates,
  listInstallations: jest
    .fn()
    .mockResolvedValue([{ name: 'gazelle', reachable: true }]),
  getIdentity: jest.fn(),
} as unknown as KagentApi;

const close = jest.fn();
const post = jest.fn(() => ({ close }));

function session(id: string, title: string): KagentSession {
  return {
    id: `gazelle/${id}`,
    sessionId: id,
    installation: 'gazelle',
    title,
    agentId: 'agent_platform__NS__pr_reviewer',
    createdAt: '2026-07-23T10:00:00Z',
    updatedAt: '2026-07-23T10:00:00Z',
  } as KagentSession;
}

function statesWith(states: Array<{ sessionId: string; state: string }>) {
  return { evaluatedAt: 0, states, unreadable: [], skipped: 0 };
}

async function renderRail(path = '/') {
  await renderInTestApp(<RecentSessions shellRail limit={8} />, {
    apis: [
      [kagentApiRef, kagentApi],
      [storageApiRef, mockApis.storage()],
      [toastApiRef, { post }],
    ],
    initialRouteEntries: [path],
    mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
  });
  await screen.findByText('Release notes');
  // The first summary is in (the rail's dot shows it): what was already
  // waiting then is not news.
  await screen.findByRole('img', { name: 'Needs your input' });
}

/** The next poll, answering with `states`. */
async function poll(states: Array<{ sessionId: string; state: string }>) {
  listSessionStates.mockResolvedValue(statesWith(states));
  await act(async () => {
    await mockQueryClient.refetchQueries();
  });
}

beforeEach(() => {
  mockQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  post.mockClear();
  close.mockClear();
  listSessions.mockReset();
  listSessionStates.mockReset();
  listSessions.mockResolvedValue([
    session('notes', 'Release notes'),
    session('old', 'Already waiting'),
  ]);
  listSessionStates.mockResolvedValue(
    statesWith([
      { sessionId: 'notes', state: 'working' },
      { sessionId: 'old', state: 'input-required' },
    ]),
  );
});

describe('NeedsInputToasts, mounted with the shell rail', () => {
  it('says nothing about a session that was already waiting', async () => {
    await renderRail();

    expect(post).not.toHaveBeenCalled();
  });

  it('raises a toast linking to a session that starts waiting', async () => {
    await renderRail();

    await poll([
      { sessionId: 'notes', state: 'input-required' },
      { sessionId: 'old', state: 'input-required' },
    ]);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/ is waiting for you$/),
        description: 'Release notes',
        links: [
          {
            label: 'Open session',
            href: '/agent-platform/sessions/gazelle/notes',
          },
        ],
      }),
    );
    // Dismissible: no timeout keeps it until closed, and nothing persists.
    expect(post.mock.calls[0]).not.toHaveProperty('0.timeout');
  });

  it('does not repeat itself while the session keeps waiting', async () => {
    await renderRail();

    await poll([{ sessionId: 'notes', state: 'input-required' }]);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await poll([{ sessionId: 'notes', state: 'input-required' }]);

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('closes the toast once the session stops waiting', async () => {
    await renderRail();

    await poll([{ sessionId: 'notes', state: 'input-required' }]);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await poll([{ sessionId: 'notes', state: 'working' }]);

    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('stays quiet about the session the person is looking at', async () => {
    await renderRail('/agent-platform/sessions/gazelle/notes');

    await poll([{ sessionId: 'notes', state: 'input-required' }]);

    // Give the effect a beat to have run, then check it chose silence.
    await act(() => new Promise(resolve => setTimeout(resolve, 50)));
    expect(post).not.toHaveBeenCalled();
  });
});

describe('findNewlyWaiting', () => {
  const states = (
    entries: Array<[string, string | null, number?]>,
  ): Map<
    string,
    { sessionId: string; state: string | null; changedAt?: number }
  > =>
    new Map(
      entries.map(([id, state, changedAt]) => [
        id,
        {
          sessionId: id,
          state,
          ...(changedAt === undefined ? {} : { changedAt }),
        },
      ]),
    );

  it('finds a session seen not waiting that waits now', () => {
    expect(
      findNewlyWaiting(
        states([['a', 'input-required']]),
        new Map([['a', false]]),
        1000,
      ),
    ).toEqual(['a']);
  });

  it('skips one that was already waiting', () => {
    expect(
      findNewlyWaiting(
        states([['a', 'input-required', 5000]]),
        new Map([['a', true]]),
        1000,
      ),
    ).toEqual([]);
  });

  it('counts a never-seen session only when it flipped after watching began', () => {
    expect(
      findNewlyWaiting(
        states([
          ['before', 'input-required', 500],
          ['after', 'input-required', 1500],
          ['unknown', 'input-required'],
        ]),
        new Map(),
        1000,
      ),
    ).toEqual(['after']);
  });

  it('ignores sessions that are not waiting', () => {
    expect(
      findNewlyWaiting(
        states([['a', 'working', 5000]]),
        new Map([['a', false]]),
        1000,
      ),
    ).toEqual([]);
  });
});
