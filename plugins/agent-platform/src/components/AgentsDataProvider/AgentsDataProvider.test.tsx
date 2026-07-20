import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildResourceErrors } from '../resourceErrorFixtures';
import { AgentsDataProvider, useAgents } from './AgentsDataProvider';

// Mock the fleet-query plumbing so the test drives the loading/partial-result
// and sticky-accumulation logic directly (see also helpers.test.ts for the row
// mapping itself). The `mock`-prefixed names are the only out-of-scope
// references jest allows inside a mock factory.
const mockUseResources = jest.fn();
let mockConfigInstallations: string[] = ['alpha', 'beta', 'gaggle'];
let mockReachable: { installations: string[]; isProbing: boolean } = {
  installations: ['alpha', 'beta', 'gaggle'],
  isProbing: false,
};

jest.mock('@backstage/core-plugin-api', () => ({
  configApiRef: {},
  useApi: () => ({
    getOptionalConfig: () => ({ keys: () => mockConfigInstallations }),
  }),
}));

jest.mock('../../hooks/useReachableInstallations', () => ({
  useReachableInstallations: () => mockReachable,
}));

jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({ modelConfigsFor: () => [], isLoading: false }),
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  Agent: class {},
  ModelConfig: class {},
  useResources: (...args: unknown[]) => mockUseResources(...args),
  isNotFoundError: (e: { type?: string; error?: { name?: string } }) =>
    e.type !== 'incompatibility' && e.error?.name === 'NotFoundError',
}));

type AgentSpec = {
  name: string;
  resourceVersion?: string;
  description?: string;
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
    mockReachable = {
      installations: ['alpha', 'beta', 'gaggle'],
      isProbing: false,
    };
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
    mockReachable = { installations: [], isProbing: true };
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
    mockReachable = { installations: ['alpha', 'gaggle'], isProbing: false };
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));
    rerender();

    await waitFor(() =>
      expect(hook.current.rows.map(r => r.name)).toEqual(['a1']),
    );
  });

  it('surfaces failing installations without dropping loaded rows', async () => {
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'] }, failed: ['gaggle'] }),
    );

    const { result: hook } = renderUseAgents();

    await waitFor(() =>
      expect(hook.current.unreachableInstallations).toEqual(['gaggle']),
    );
    expect(hook.current.rows).toHaveLength(1);
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.isLoadingMore).toBe(false);
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
    mockReachable = { installations: ['alpha', 'grizzly'], isProbing: false };

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
    mockReachable = { installations: ['alpha', 'beta'], isProbing: false };
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
