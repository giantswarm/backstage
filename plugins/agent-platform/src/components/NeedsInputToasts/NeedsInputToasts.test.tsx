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
import { NEEDS_INPUT_TOAST_BURST, NeedsInputToasts } from './NeedsInputToasts';

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

/**
 * How the shell mounts things. `watcher` alone is a collapsed rail or the
 * phone's bar: the rail's session list is not there, the watcher is. `rail`
 * adds the expanded rail's list beside it; `railOnly` is the list without
 * the watcher.
 */
type Mount = 'watcher' | 'rail' | 'railOnly';

async function renderShell(path = '/', mount: Mount = 'watcher') {
  await renderInTestApp(
    <>
      {mount !== 'watcher' && <RecentSessions shellRail limit={8} />}
      {mount !== 'railOnly' && <NeedsInputToasts />}
    </>,
    {
      apis: [
        [kagentApiRef, kagentApi],
        [storageApiRef, mockApis.storage()],
        [toastApiRef, { post }],
      ],
      initialRouteEntries: [path],
      mountedRoutes: { '/sessions': sessionsRouteRef },
    },
  );
  // The first summary is in: what was already waiting then is not news.
  await waitFor(() => expect(listSessionStates).toHaveBeenCalled());
  await waitFor(() => expect(mockQueryClient.isFetching()).toBe(0));
  if (mount !== 'watcher') {
    await screen.findByRole('img', { name: 'Needs your input' });
  }
}

const renderRail = (path = '/') => renderShell(path);

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

describe('NeedsInputToasts, mounted without the rail’s list (collapsed rail, phone)', () => {
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
            href: '/sessions/gazelle/notes',
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
    await renderRail('/sessions/gazelle/notes');

    await poll([{ sessionId: 'notes', state: 'input-required' }]);

    // Give the effect a beat to have run, then check it chose silence.
    await act(() => new Promise(resolve => setTimeout(resolve, 50)));
    expect(post).not.toHaveBeenCalled();
  });
});

describe('NeedsInputToasts, one mount per shell', () => {
  it('raises one toast, not two, beside the expanded rail', async () => {
    await renderShell('/', 'rail');

    await poll([{ sessionId: 'notes', state: 'input-required' }]);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await act(() => new Promise(resolve => setTimeout(resolve, 50)));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('leaves the toast to the watcher: the rail’s list raises none', async () => {
    await renderShell('/', 'railOnly');

    await poll([{ sessionId: 'notes', state: 'input-required' }]);

    await act(() => new Promise(resolve => setTimeout(resolve, 50)));
    expect(post).not.toHaveBeenCalled();
  });
});

describe('NeedsInputToasts, many sessions at once (T39)', () => {
  const titles = ['One', 'Two', 'Three', 'Four', 'Five'];

  async function renderWith(count: number) {
    listSessions.mockResolvedValue(
      titles.slice(0, count).map(title => session(title.toLowerCase(), title)),
    );
    listSessionStates.mockResolvedValue(
      statesWith(
        titles
          .slice(0, count)
          .map(title => ({ sessionId: title.toLowerCase(), state: 'working' })),
      ),
    );
    await renderShell();
    await poll(
      titles.slice(0, count).map(title => ({
        sessionId: title.toLowerCase(),
        state: 'input-required',
      })),
    );
  }

  it(`still names each session up to ${NEEDS_INPUT_TOAST_BURST} at once`, async () => {
    await renderWith(NEEDS_INPUT_TOAST_BURST);

    await waitFor(() =>
      expect(post).toHaveBeenCalledTimes(NEEDS_INPUT_TOAST_BURST),
    );
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Two' }),
    );
  });

  it('counts a larger burst in one toast that opens the Waiting chip', async () => {
    await renderWith(NEEDS_INPUT_TOAST_BURST + 1);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        title: `${NEEDS_INPUT_TOAST_BURST + 1} sessions need your input`,
        links: [
          {
            label: 'Show waiting sessions',
            href: '/sessions?state=waiting',
          },
        ],
      }),
    );

    // Gone once none of them waits any more.
    await poll(
      titles.map(title => ({
        sessionId: title.toLowerCase(),
        state: 'working',
      })),
    );
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
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
