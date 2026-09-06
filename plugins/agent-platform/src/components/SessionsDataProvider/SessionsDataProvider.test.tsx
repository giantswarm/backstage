import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../../apis';
import { KagentApi, KagentInstallation } from '../../apis/types';
import { KagentSession } from '../../lib/kagentSessions';
import { SessionsDataProvider, useSessions } from './SessionsDataProvider';

// Mock the fleet plumbing so the test drives the fan-out, classification and
// loading logic directly. `mock`-prefixed names are the only out-of-scope
// references jest allows inside a mock factory.
let mockConfigInstallations: string[] = ['gazelle', 'golem'];
// What the gs installation inventory reports for kagent: the installations
// whose API groups include kagent.dev and whose access is healthy (home first).
let mockKagent: {
  installations: string[];
  isProbing: boolean;
  isLoading?: boolean;
} = {
  installations: ['gazelle', 'golem'],
  isProbing: false,
};
let mockAgentRows: unknown[] = [];
let mockCapabilities: Record<string, { isUserScoped?: boolean }> = {};

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockConfigInstallations.map(name => ({ name })),
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    entries: [],
    home: mockKagent.installations[0],
    isLoading: mockKagent.isLoading ?? false,
    isProbing: mockKagent.isProbing,
    // Only kagent matters to this provider; the inventory's other components
    // are somebody else's question.
    installationsWith: (component: string) =>
      component === 'kagent' ? mockKagent.installations : [],
    refresh: () => {},
  }),
}));

jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({ rows: mockAgentRows }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilitiesMap: () => (installation: string) =>
    mockCapabilities[installation] ?? {},
}));

const listSessions = jest.fn();
const listInstallations = jest.fn();

/** One entry of the backend's list; reachable unless said otherwise. */
function proxied(
  name: string,
  reachable: KagentInstallation['reachable'] = true,
  reason?: string,
): KagentInstallation {
  return { name, reachable, ...(reason && { reason }) };
}

const kagentApi = {
  listSessions,
  listInstallations,
  getIdentity: jest.fn(),
} as unknown as KagentApi;

function session(overrides: Partial<KagentSession> = {}): KagentSession {
  return {
    id: 'gazelle/abc',
    sessionId: 'abc',
    installation: 'gazelle',
    title: 'A session',
    updatedAt: '2026-07-23T10:00:00Z',
    ...overrides,
  };
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function renderProvider(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>
        <SessionsDataProvider>{children}</SessionsDataProvider>
      </QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSessions(), { wrapper });
}

beforeEach(() => {
  listSessions.mockReset();
  listInstallations.mockReset();
  listInstallations.mockResolvedValue([proxied('gazelle'), proxied('golem')]);
  mockConfigInstallations = ['gazelle', 'golem'];
  mockKagent = { installations: ['gazelle', 'golem'], isProbing: false };
  mockAgentRows = [];
  mockCapabilities = {};
});

describe('SessionsDataProvider', () => {
  it('aggregates rows across installations, most recent first', async () => {
    listSessions.mockImplementation((installation: string) =>
      Promise.resolve(
        installation === 'gazelle'
          ? [
              session({
                id: 'gazelle/old',
                updatedAt: '2026-07-20T10:00:00Z',
                title: 'older',
              }),
            ]
          : [
              session({
                id: 'golem/new',
                installation: 'golem',
                updatedAt: '2026-07-23T10:00:00Z',
                title: 'newer',
              }),
            ],
      ),
    );

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows.map(row => row.title)).toEqual([
      'newer',
      'older',
    ]);
    // Every row carries its origin, since the list is fleet-wide.
    expect(result.current.rows.map(row => row.installation)).toEqual([
      'golem',
      'gazelle',
    ]);
  });

  it('queries one installation per kagent installation the backend proxies', async () => {
    listSessions.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
    expect(listSessions).toHaveBeenCalledWith('gazelle');
    expect(listSessions).toHaveBeenCalledWith('golem');
  });

  it('never queries an installation the backend lists but whose inventory lacks kagent', async () => {
    // The backend derives a kagent URL for every installation with a base
    // domain, so its list says nothing about who runs kagent. Before the
    // inventory, every such installation was asked and answered 404 or, when
    // its hostname is private, a 500 after the proxy timeout — on every view.
    mockConfigInstallations = ['gazelle', 'golem', 'wombat'];
    listInstallations.mockResolvedValue([
      proxied('gazelle'),
      proxied('golem'),
      proxied('wombat'),
    ]);
    mockKagent = { installations: ['gazelle', 'golem'], isProbing: false };
    listSessions.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
    expect(listSessions).toHaveBeenCalledWith('gazelle');
    expect(listSessions).toHaveBeenCalledWith('golem');
    expect(listSessions).not.toHaveBeenCalledWith('wombat');
  });

  it('trims the fan-out to the backend’s kagent allowlist', async () => {
    // kagent runs on only some installations; querying the rest is wasted work —
    // and each wasted request mints that installation's Dex token before it can
    // fail.
    listInstallations.mockResolvedValue([proxied('gazelle')]);
    listSessions.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
    expect(listSessions).toHaveBeenCalledWith('gazelle');
    expect(listSessions).not.toHaveBeenCalledWith('golem');
  });

  it('queries nothing until the allowlist resolves', async () => {
    // The whole point of waiting: no request may go out before we know which
    // installations actually have kagent, or the fan-out is doomed-by-default.
    let resolveAllowlist: (value: KagentInstallation[]) => void = () => {};
    listInstallations.mockReturnValue(
      new Promise<KagentInstallation[]>(resolve => {
        resolveAllowlist = resolve;
      }),
    );
    listSessions.mockResolvedValue([]);

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(listSessions).not.toHaveBeenCalled();

    resolveAllowlist([proxied('gazelle')]);

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
  });

  it('falls back to the inventory’s kagent installations when the backend list fails', async () => {
    // A backend hiccup must not look like "you have no sessions".
    listInstallations.mockRejectedValue(new Error('backend down'));
    listSessions.mockResolvedValue([session()]);

    const { result } = renderProvider();

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
    expect(result.current.rows.length).toBeGreaterThan(0);
  });

  describe('endpoint reachability', () => {
    it('never queries an installation the backend reports as not reachable from this portal', async () => {
      // The backend's unauthenticated probe already knows the answer; the
      // per-user request would only mint a token and wait out the proxy's
      // timeout into a 500, on every page view.
      listInstallations.mockResolvedValue([
        proxied('gazelle'),
        proxied('golem', false, 'DNS lookup failed (ENOTFOUND)'),
      ]);
      listSessions.mockResolvedValue([session()]);

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      expect(listSessions).toHaveBeenCalledTimes(1);
      expect(listSessions).toHaveBeenCalledWith('gazelle');
      expect(result.current.notReachableInstallations).toEqual(['golem']);
      // Not a read failure: nothing was read.
      expect(result.current.unreachableInstallations).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isLoadingMore).toBe(false);
    });

    it("queries an installation whose reachability is still 'unknown'", async () => {
      // The backend answers 'unknown' until its first probe settles; that is
      // not a verdict, so the installation is treated as it always was.
      listInstallations.mockResolvedValue([
        proxied('gazelle'),
        proxied('golem', 'unknown'),
      ]);
      listSessions.mockResolvedValue([]);

      const { result } = renderProvider();

      await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
      expect(listSessions).toHaveBeenCalledWith('golem');
      expect(result.current.notReachableInstallations).toEqual([]);
    });

    it('lists only installations that run kagent as not reachable', async () => {
      // The backend derives a kagent URL for every installation with a base
      // domain, so it also probes installations without kagent; an
      // unreachable URL there is nothing the Sessions tab needs to mention.
      mockConfigInstallations = ['gazelle', 'golem', 'wombat'];
      mockKagent = { installations: ['gazelle', 'golem'], isProbing: false };
      listInstallations.mockResolvedValue([
        proxied('gazelle'),
        proxied('golem', false, 'no answer within 3000 ms'),
        proxied('wombat', false, 'no answer within 3000 ms'),
      ]);
      listSessions.mockResolvedValue([]);

      const { result } = renderProvider();

      await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
      expect(result.current.notReachableInstallations).toEqual(['golem']);
    });

    it('ignores a names-only list persisted under the previous query key', async () => {
      // The agent-platform cache is persisted across releases. Before this
      // shape the list lived under ['agent-platform','kagent','installations']
      // as an array of names, for up to an hour; it must not be read as the
      // new shape, and must not stop the new key from being fetched.
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(
        ['agent-platform', 'kagent', 'installations'],
        ['gazelle', 'golem', 'wombat'],
      );
      listInstallations.mockResolvedValue([
        proxied('gazelle'),
        proxied('golem', false, 'connection refused (ECONNREFUSED)'),
      ]);
      listSessions.mockResolvedValue([]);

      const { result } = renderProvider(queryClient);

      await waitFor(() => expect(listInstallations).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(result.current.notReachableInstallations).toEqual(['golem']),
      );
      expect(listSessions).toHaveBeenCalledTimes(1);
      expect(listSessions).toHaveBeenCalledWith('gazelle');
    });
  });

  it('excludes A2A subagent sessions', async () => {
    listSessions.mockImplementation((installation: string) =>
      Promise.resolve(
        installation === 'gazelle'
          ? [session({ id: 'gazelle/sub', source: 'agent' }), session()]
          : [],
      ),
    );

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].id).toBe('gazelle/abc');
  });

  describe('per-installation failure classification', () => {
    it.each([
      ['NotFoundError', 'kagent is not deployed there'],
      ['ServiceUnavailableError', 'the host does not resolve'],
    ])('stays silent for %s (%s)', async errorName => {
      // The common case across a fleet where kagent runs on a couple of
      // installations, and not something a user can act on.
      listSessions.mockImplementation((installation: string) =>
        installation === 'gazelle'
          ? Promise.resolve([session()])
          : Promise.reject(namedError(errorName)),
      );

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      expect(result.current.unreachableInstallations).toEqual([]);
    });

    it.each([
      'ForbiddenError',
      'UnauthorizedError',
      // Raised by the backend for a 5xx/429, a timeout, or an unreadable body —
      // kagent answered and failed, so it is deployed and unwell. Must not share
      // the silent path with "unreachable", or a degraded installation's sessions
      // would vanish with no alert.
      'UpstreamError',
      'Error',
    ])('surfaces %s', async errorName => {
      listSessions.mockImplementation((installation: string) =>
        installation === 'gazelle'
          ? Promise.resolve([session()])
          : Promise.reject(namedError(errorName)),
      );

      const { result } = renderProvider();

      await waitFor(() =>
        expect(result.current.unreachableInstallations).toEqual(['golem']),
      );
      // The healthy installation's rows still render.
      expect(result.current.rows).toHaveLength(1);
    });

    it('does not let one failing installation empty the table', async () => {
      listSessions.mockImplementation((installation: string) =>
        installation === 'gazelle'
          ? Promise.resolve([session()])
          : Promise.reject(namedError('ForbiddenError')),
      );

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('loading states', () => {
    it('reports isLoadingMore, not isLoading, once some rows are in', async () => {
      // One installation answers, the other never settles: the table must show
      // what it has rather than a blocking skeleton.
      listSessions.mockImplementation((installation: string) =>
        installation === 'gazelle'
          ? Promise.resolve([session()])
          : new Promise(() => {}),
      );

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isLoadingMore).toBe(true);
    });

    it('is not loading when no installations are configured', async () => {
      // useReachableInstallations reports isProbing forever on an empty fleet, so
      // without the hasInstallations gate this would pin isLoading true and hide
      // the "no installations configured" empty state.
      mockConfigInstallations = [];
      mockKagent = { installations: [], isProbing: true };

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.hasInstallations).toBe(false));
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('user scoping', () => {
    it('flags an installation whose kagent is not user-scoped', async () => {
      mockCapabilities = { golem: { isUserScoped: false } };
      listSessions.mockImplementation((installation: string) =>
        Promise.resolve([session({ id: `${installation}/x`, installation })]),
      );

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.rows).toHaveLength(2));
      expect(result.current.notUserScopedInstallations).toEqual(['golem']);
    });

    it.each([
      ['unknown', undefined],
      ['confirmed scoped', true],
    ])('stays silent when scoping is %s', async (_label, isUserScoped) => {
      // `undefined` means the probe hasn't resolved or kagent reported no subject
      // — warning there would flag a healthy installation for no reason.
      mockCapabilities = { golem: { isUserScoped } };
      listSessions.mockImplementation((installation: string) =>
        Promise.resolve([session({ id: `${installation}/x`, installation })]),
      );

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.rows).toHaveLength(2));
      expect(result.current.notUserScopedInstallations).toEqual([]);
    });

    it('does not flag an installation contributing no rows', async () => {
      // Warning that a list "isn't yours" is meaningless when it's empty.
      mockCapabilities = { golem: { isUserScoped: false } };
      listSessions.mockImplementation((installation: string) =>
        Promise.resolve(installation === 'gazelle' ? [session()] : []),
      );

      const { result } = renderProvider();

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      expect(result.current.notUserScopedInstallations).toEqual([]);
    });
  });

  it('resolves agent display names from the loaded Agent CRs', async () => {
    mockAgentRows = [
      {
        id: 'gazelle/kagent/sre-agent',
        installation: 'gazelle',
        namespace: 'kagent',
        name: 'SRE agent',
        technicalName: 'sre-agent',
        description: '',
        skillCount: 0,
      },
    ];
    listSessions.mockImplementation((installation: string) =>
      Promise.resolve(
        installation === 'gazelle'
          ? [session({ agentId: 'kagent__NS__sre_agent' })]
          : [],
      ),
    );

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].agentName).toBe('SRE agent');
    expect(result.current.rows[0].agentTechnicalName).toBe('sre-agent');
  });

  it('throws when used outside the provider', () => {
    // React logs the render error itself; silence it so the suite output stays
    // readable.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useSessions())).toThrow(
        /must be used within a SessionsDataProvider/,
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
