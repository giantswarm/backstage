import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AgentReadiness } from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildResourceErrors } from '../resourceErrorFixtures';
import { AgentsDataProvider, useAgents } from './AgentsDataProvider';

// Mock the fleet-query plumbing so the test drives the loading/partial-result
// and sticky-accumulation logic directly (see also helpers.test.ts for the row
// mapping itself). One stub answers both reads the provider makes per render —
// the AgentTemplates and their carrier RemoteMCPServers — so the first call of
// a render is always the templates' and the last the carriers'. The
// `mock`-prefixed names are the only out-of-scope references jest allows inside
// a mock factory.
const mockUseResources = jest.fn();
let mockConfigInstallations: string[] = ['alpha', 'beta', 'gaggle'];
// What the gs installation inventory reports for kagent: the installations
// whose API groups include kagent.dev and whose access is healthy (home
// first), and whether some installation may still answer.
let mockKagent: {
  installations: string[];
  isProbing: boolean;
  isLoading?: boolean;
  home?: string;
} = {
  installations: ['alpha', 'beta', 'gaggle'],
  isProbing: false,
};
// The section's installation scope: everything, or one pinned installation.
let mockScope = 'all';

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  applyInstallationScope: (installations: string[], scope: string) =>
    scope === 'all'
      ? installations
      : installations.filter(installation => installation === scope),
  useInstallations: () => ({
    installations: mockConfigInstallations.map(name => ({ name })),
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    entries: [],
    home: mockKagent.home,
    isLoading: mockKagent.isLoading ?? false,
    isProbing: mockKagent.isProbing,
    // Only kagent matters to this provider; the inventory's other components
    // are somebody else's question.
    installationsWith: (component: string) =>
      component === 'kagent' ? mockKagent.installations : [],
    refresh: () => {},
  }),
  useInstallationScope: () => ({
    scope: mockScope,
    setScope: () => {},
    installations: [],
    home: mockKagent.home,
    isSingleInstallation: false,
    isLoading: false,
  }),
}));

jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({ modelConfigsFor: () => [], isLoading: false }),
}));

// No serving layer in view here: the rows carry no model state, which is the
// provider's contract when nobody mounted a ServingProvider above it.
jest.mock('../ServingProvider', () => ({
  useOptionalServing: () => undefined,
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  // The real module underneath: the toolset read pulls in the muster plugin,
  // whose resource classes extend this library's KubeObject at import time.
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  Agent: class {},
  ModelConfig: class {},
  RemoteMCPServer: class {},
  useResources: (...args: unknown[]) => mockUseResources(...args),
  isNotFoundError: (e: { type?: string; error?: { name?: string } }) =>
    e.type !== 'incompatibility' && e.error?.name === 'NotFoundError',
}));

type AgentSpec = {
  name: string;
  resourceVersion?: string;
  description?: string;
  readiness?: AgentReadiness;
};

// Duck-typed stand-in for an Agent instance — only the getters toAgentRow uses.
function fakeAgent(cluster: string, spec: AgentSpec) {
  return {
    cluster,
    getNamespace: () => 'team-a',
    getName: () => spec.name,
    getDisplayName: () => spec.name,
    getDescription: () => spec.description ?? '',
    getModelConfigName: () => undefined,
    getSkillCount: () => 0,
    getReadiness: () => spec.readiness ?? 'ready',
    getDecidingHarness: () => ({ name: 'kagent' }),
    getReadinessMessage: () => undefined,
    getHarnessWarnings: () => [],
    getMcpBindings: () => [],
  };
}

/**
 * Build a `useResources` return value. `succeeded` maps each successfully-read
 * installation to the agents it returned (a name string, or a spec with
 * resourceVersion/description); `failed` lists installations whose read errored
 * (403/unreachable); `notFound` lists installations that 404'd (kagent not
 * installed).
 */
function result({
  succeeded = {},
  failed = [],
  notFound = [],
  isLoading = false,
}: {
  succeeded?: Record<string, Array<string | AgentSpec>>;
  failed?: string[];
  notFound?: string[];
  isLoading?: boolean;
}) {
  const specs = (entries: Array<string | AgentSpec>): AgentSpec[] =>
    entries.map(e => (typeof e === 'string' ? { name: e } : e));

  const resources = Object.entries(succeeded).flatMap(([cluster, entries]) =>
    specs(entries).map(spec => fakeAgent(cluster, spec)),
  );
  const clustersData = Object.entries(succeeded).map(([cluster, entries]) => ({
    cluster,
    data: specs(entries).map(spec => ({
      metadata: { name: spec.name, resourceVersion: spec.resourceVersion },
    })),
  }));
  const errors = buildResourceErrors({ failed, notFound });
  return { resources, clustersData, isLoading, errors };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AgentsDataProvider>{children}</AgentsDataProvider>
);

const renderUseAgents = () => renderHook(() => useAgents(), { wrapper });

describe('AgentsDataProvider', () => {
  beforeEach(() => {
    mockUseResources.mockReset();
    mockConfigInstallations = ['alpha', 'beta', 'gaggle'];
    mockKagent = {
      installations: ['alpha', 'beta', 'gaggle'],
      isProbing: false,
    };
  });

  it('lists Agents only on installations whose inventory has kagent, never elsewhere', () => {
    // gaggle is configured and reachable but runs no kagent: the inventory
    // leaves it out, so no list request ever goes there (it used to 404).
    mockKagent = { installations: ['alpha', 'beta'], isProbing: false };
    mockUseResources.mockReturnValue(result({}));

    renderUseAgents();

    expect(mockUseResources.mock.calls[0][0]).toEqual(['alpha', 'beta']);
  });

  it('shows a blocking skeleton while the inventory has not answered for the home yet', () => {
    mockKagent = { installations: [], isProbing: false, isLoading: true };
    mockUseResources.mockReturnValue(result({}));

    const { result: hook } = renderUseAgents();

    expect(hook.current.isLoading).toBe(true);
    expect(hook.current.rows).toHaveLength(0);
  });

  it('shows a blocking skeleton only until the first installation responds', () => {
    mockUseResources.mockReturnValue(result({ isLoading: true }));

    const { result: hook } = renderUseAgents();

    expect(hook.current.rows).toHaveLength(0);
    expect(hook.current.isLoading).toBe(true);
    expect(hook.current.isLoadingMore).toBe(false);
  });

  it('reports not-loading with no installations configured (so the empty state can show)', () => {
    // No installations configured: useReachableInstallations reports isProbing
    // forever (empty-status fallback). isLoading must not be pinned true, or the
    // "no installations configured" empty state is unreachable.
    mockConfigInstallations = [];
    mockKagent = { installations: [], isProbing: true };
    mockUseResources.mockReturnValue(result({}));

    const { result: hook } = renderUseAgents();

    expect(hook.current.hasInstallations).toBe(false);
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.isLoadingMore).toBe(false);
  });

  it('renders rows as soon as they arrive, even while other installations load', async () => {
    // alpha returned an agent; the fleet query is still loading (others pending).
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'] }, isLoading: true }),
    );

    const { result: hook } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(1));
    // The already-loaded row must not be hidden behind a skeleton...
    expect(hook.current.isLoading).toBe(false);
    // ...but the UI still signals more installations are in flight.
    expect(hook.current.isLoadingMore).toBe(true);
  });

  it('refreshes an agent’s fields on an in-place edit (same name, new resourceVersion)', async () => {
    mockUseResources.mockReturnValue(
      result({
        succeeded: {
          alpha: [{ name: 'a1', resourceVersion: '1', description: 'old' }],
        },
      }),
    );

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows[0]?.description).toBe('old'));

    // Same name, bumped resourceVersion + edited description — must propagate.
    mockUseResources.mockReturnValue(
      result({
        succeeded: {
          alpha: [{ name: 'a1', resourceVersion: '2', description: 'new' }],
        },
      }),
    );
    rerender();

    await waitFor(() => expect(hook.current.rows[0]?.description).toBe('new'));
  });

  it('keeps an installation’s agents through a transient miss while it stays reachable', async () => {
    // First: both alpha and beta responded.
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'], beta: ['b1'] } }),
    );

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(2));

    // A refetch returns only alpha this round, but beta is still reachable —
    // its agents must not vanish.
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));
    rerender();

    await waitFor(() =>
      expect(hook.current.rows.map(r => r.name).sort()).toEqual(['a1', 'b1']),
    );
  });

  it('prunes an installation that durably leaves the reachable set', async () => {
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'], beta: ['b1'] } }),
    );

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(2));

    // beta drops out of the reachable set (session-expired / degraded / removed)
    // and is no longer queried — its stale agents must be pruned.
    mockKagent = { installations: ['alpha', 'gaggle'], isProbing: false };
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));
    rerender();

    await waitFor(() =>
      expect(hook.current.rows.map(r => r.name)).toEqual(['a1']),
    );
  });

  it('surfaces failing installations without dropping loaded rows', async () => {
    // Every reachable installation reports, so the fleet is genuinely settled and
    // `isLoadingMore` is false. beta is included (with no agents) deliberately:
    // an installation that has reported neither data nor an error still has a
    // query in flight, which *is* "loading more" — see the test above.
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'], beta: [] }, failed: ['gaggle'] }),
    );

    const { result: hook } = renderUseAgents();

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual(['gaggle']),
    );
    expect(hook.current.rows).toHaveLength(1);
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.isLoadingMore).toBe(false);
  });

  // A settled fleet must not claim to be loading just because a poll is in
  // flight: every installation refetches on an interval now, and the bar sits
  // above the table.
  it('does not report loading more while a settled fleet refetches', async () => {
    const settled = {
      succeeded: { alpha: ['a1'], beta: ['b1'], gaggle: ['g1'] },
    };
    mockUseResources.mockReturnValue(result(settled));

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(3));
    expect(hook.current.isLoadingMore).toBe(false);

    // A background poll is in flight for every installation.
    mockUseResources.mockReturnValue(result({ ...settled, isLoading: true }));
    rerender();
    expect(hook.current.isLoadingMore).toBe(false);
    expect(hook.current.rows).toHaveLength(3);
  });

  // The converse, and the reason `isProbing` stays in the signal: an
  // installation still `connecting` is absent from the healthy-only reachable
  // set, so it can never show up as a "pending installation" — but it may
  // resolve and contribute rows. Dropping the probe switched the bar off during
  // exactly this fan-in.
  it('reports loading more while installations are still being probed', async () => {
    // Only alpha is healthy so far; beta and gaggle are still connecting.
    mockKagent = { installations: ['alpha'], isProbing: true };
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));

    const { result: hook } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(1));
    // alpha has reported, so nothing is "pending" — the probe is the only signal
    // that more rows are coming.
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.isLoadingMore).toBe(true);
  });

  it('treats a 404 (kagent not installed) as zero agents, not a failure', async () => {
    // grizzly is reachable but kagent isn't deployed there → the list 404s.
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'] }, notFound: ['grizzly'] }),
    );

    const { result: hook } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(1));
    // grizzly must not be flagged as "couldn't read".
    expect(hook.current.unreachableInstallations).toEqual([]);
  });

  it('reclassifies a cluster when its error flips 404 → 403 on a refetch', async () => {
    // grizzly must be reachable for the card to consider it at all.
    mockConfigInstallations = ['alpha', 'grizzly'];
    mockKagent = { installations: ['alpha', 'grizzly'], isProbing: false };

    // First render: grizzly 404s (kagent not installed) → treated as empty.
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'] }, notFound: ['grizzly'] }),
    );

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual([]),
    );

    // Same cluster now 403 on a background refetch (RBAC changed). The reconcile
    // signature must include the error name, or this same-cluster error→error
    // transition would be invisible and grizzly would stay unflagged.
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'] }, failed: ['grizzly'] }),
    );
    rerender();

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual(['grizzly']),
    );
  });

  it('drops a failing installation from the card once it leaves the reachable set', async () => {
    // gaggle fails while still reachable → surfaced in the card.
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'] }, failed: ['gaggle'] }),
    );

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual(['gaggle']),
    );

    // gaggle degrades mid-session: it leaves the reachable (healthy) set and is
    // no longer queried. The sidebar Cluster-access widget owns that state, so it
    // must drop out of the "couldn't read" card rather than duplicate it.
    mockKagent = { installations: ['alpha', 'beta'], isProbing: false };
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));
    rerender();

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual([]),
    );
  });

  it('does not report an installation as unreachable while its agents are still shown', async () => {
    // alpha succeeded first...
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(1));

    // ...then a background refetch of alpha fails. Its last-known agent is still
    // shown, so it must not also be reported as "couldn't read".
    mockUseResources.mockReturnValue(result({ failed: ['alpha'] }));
    rerender();

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual([]),
    );
    expect(hook.current.rows).toHaveLength(1);
  });
});

describe('AgentsDataProvider installation scope', () => {
  beforeEach(() => {
    mockUseResources.mockReset();
    mockConfigInstallations = ['alpha', 'beta', 'gaggle'];
    mockKagent = {
      installations: ['alpha', 'beta', 'gaggle'],
      isProbing: false,
      home: 'alpha',
    };
    mockScope = 'all';
  });

  it('queries the home installation alone until it has answered, then the rest', async () => {
    // Whatever is asked, only alpha answers at first.
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));

    const { result: hook } = renderHook(() => useAgents(), { wrapper });

    // The very first read asks for the home installation only.
    expect(mockUseResources.mock.calls[0][0]).toEqual(['alpha']);
    await waitFor(() =>
      expect(hook.current.rows.map(row => row.name)).toEqual(['a1']),
    );
    // Once it answered, everyone in scope is asked.
    await waitFor(() =>
      expect(mockUseResources.mock.calls.at(-1)?.[0]).toEqual([
        'alpha',
        'beta',
        'gaggle',
      ]),
    );
    // Rows are on screen while the others load: not "loading", but "more".
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.isLoadingMore).toBe(true);
  });

  it('asks everyone at once when the home answers with a failure too', async () => {
    mockUseResources.mockReturnValue(result({ failed: ['alpha'] }));

    renderHook(() => useAgents(), { wrapper });

    await waitFor(() =>
      expect(mockUseResources.mock.calls.at(-1)?.[0]).toEqual([
        'alpha',
        'beta',
        'gaggle',
      ]),
    );
  });

  it('narrows every read to a pinned installation', async () => {
    mockScope = 'beta';
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'], beta: ['b1'] } }),
    );

    const { result: hook } = renderHook(() => useAgents(), { wrapper });

    expect(mockUseResources.mock.calls[0][0]).toEqual(['beta']);
    await waitFor(() =>
      expect(hook.current.rows.map(row => row.name)).toEqual(['b1']),
    );
    expect(hook.current.scope).toBe('beta');
    expect(hook.current.installations).toEqual(['beta']);
    expect(hook.current.isLoadingMore).toBe(false);
  });

  it('reports an installation that could not be read next to the rows of the others', async () => {
    mockUseResources.mockReturnValue(
      result({
        succeeded: { alpha: ['a2', 'a1'], beta: [] },
        failed: ['gaggle'],
      }),
    );

    const { result: hook } = renderHook(() => useAgents(), { wrapper });

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual(['gaggle']),
    );
    // Everyone in scope is listed; the flat rows are sorted by installation
    // and name, the home installation first.
    expect(hook.current.installations).toEqual(['alpha', 'beta', 'gaggle']);
    expect(hook.current.rows.map(row => [row.installation, row.name])).toEqual([
      ['alpha', 'a1'],
      ['alpha', 'a2'],
    ]);
  });
});
