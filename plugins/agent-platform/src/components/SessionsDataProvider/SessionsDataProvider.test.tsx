import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../../apis';
import { KagentApi } from '../../apis/types';
import { KagentSession } from '../../lib/kagentSessions';
import { SessionsDataProvider, useSessions } from './SessionsDataProvider';

// Mock the fleet plumbing so the test drives the fan-out, classification and
// loading logic directly. `mock`-prefixed names are the only out-of-scope
// references jest allows inside a mock factory.
let mockConfigInstallations: string[] = ['gazelle', 'golem'];
let mockReachable: { installations: string[]; isProbing: boolean } = {
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
}));

jest.mock('../../hooks/useReachableInstallations', () => ({
  useReachableInstallations: () => mockReachable,
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

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
  listInstallations.mockResolvedValue(['gazelle', 'golem']);
  mockConfigInstallations = ['gazelle', 'golem'];
  mockReachable = { installations: ['gazelle', 'golem'], isProbing: false };
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

  it('queries one installation per reachable, allowlisted installation', async () => {
    listSessions.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
    expect(listSessions).toHaveBeenCalledWith('gazelle');
    expect(listSessions).toHaveBeenCalledWith('golem');
  });

  it('trims the fan-out to the backend’s kagent allowlist', async () => {
    // kagent runs on only some installations; querying the rest is wasted work —
    // and each wasted request mints that installation's Dex token before it can
    // fail.
    listInstallations.mockResolvedValue(['gazelle']);
    listSessions.mockResolvedValue([]);

    renderProvider();

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
    expect(listSessions).toHaveBeenCalledWith('gazelle');
    expect(listSessions).not.toHaveBeenCalledWith('golem');
  });

  it('queries nothing until the allowlist resolves', async () => {
    // The whole point of waiting: no request may go out before we know which
    // installations actually have kagent, or the fan-out is doomed-by-default.
    let resolveAllowlist: (value: string[]) => void = () => {};
    listInstallations.mockReturnValue(
      new Promise<string[]>(resolve => {
        resolveAllowlist = resolve;
      }),
    );
    listSessions.mockResolvedValue([]);

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(listSessions).not.toHaveBeenCalled();

    resolveAllowlist(['gazelle']);

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
  });

  it('falls back to the reachable set when the allowlist itself fails', async () => {
    // A backend hiccup must not look like "you have no sessions".
    listInstallations.mockRejectedValue(new Error('backend down'));
    listSessions.mockResolvedValue([session()]);

    const { result } = renderProvider();

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
    expect(result.current.rows.length).toBeGreaterThan(0);
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

    it.each(['ForbiddenError', 'UnauthorizedError', 'Error'])(
      'surfaces %s',
      async errorName => {
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
      },
    );

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
      mockReachable = { installations: [], isProbing: true };

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
