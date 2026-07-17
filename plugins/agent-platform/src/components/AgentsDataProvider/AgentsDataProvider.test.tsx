import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AgentsDataProvider, useAgents } from './AgentsDataProvider';

// Mock the fleet-query plumbing so the test drives the loading/partial-result
// and sticky-accumulation logic directly (see also helpers.test.ts for the row
// mapping itself).
const mockUseResources = jest.fn();

jest.mock('@backstage/core-plugin-api', () => ({
  configApiRef: {},
  useApi: () => ({
    getOptionalConfig: () => ({ keys: () => ['alpha', 'beta', 'gaggle'] }),
  }),
}));

jest.mock('../../hooks/useReachableInstallations', () => ({
  useReachableInstallations: () => ({
    installations: ['alpha', 'beta', 'gaggle'],
    isProbing: false,
  }),
}));

jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({ modelConfigsFor: () => [], isLoading: false }),
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  Agent: class {},
  ModelConfig: class {},
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

// Duck-typed stand-in for an Agent instance — only the getters toAgentRow uses.
function fakeAgent(cluster: string, name: string) {
  return {
    cluster,
    getNamespace: () => 'team-a',
    getName: () => name,
    getDisplayName: () => name,
    getDescription: () => '',
    getModelConfigName: () => undefined,
    getSkillCount: () => 0,
  };
}

/**
 * Build a `useResources` return value. `succeeded` maps each successfully-read
 * installation to the agent names it returned (the source of both `resources`
 * and `clustersData`); `failed` lists installations whose read errored.
 */
function result({
  succeeded = {},
  failed = [],
  isLoading = false,
}: {
  succeeded?: Record<string, string[]>;
  failed?: string[];
  isLoading?: boolean;
}) {
  const resources = Object.entries(succeeded).flatMap(([cluster, names]) =>
    names.map(name => fakeAgent(cluster, name)),
  );
  const clustersData = Object.entries(succeeded).map(([cluster, names]) => ({
    cluster,
    data: names.map(name => ({ metadata: { name } })),
  }));
  const errors = failed.map(cluster => ({ cluster }));
  return { resources, clustersData, isLoading, errors };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AgentsDataProvider>{children}</AgentsDataProvider>
);

const renderUseAgents = () => renderHook(() => useAgents(), { wrapper });

describe('AgentsDataProvider', () => {
  beforeEach(() => mockUseResources.mockReset());

  it('shows a blocking skeleton only until the first installation responds', () => {
    mockUseResources.mockReturnValue(result({ isLoading: true }));

    const { result: hook } = renderUseAgents();

    expect(hook.current.rows).toHaveLength(0);
    expect(hook.current.isLoading).toBe(true);
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

  it('keeps an installation’s agents when it later drops out of the queried set', async () => {
    // First: both alpha and beta responded.
    mockUseResources.mockReturnValue(
      result({ succeeded: { alpha: ['a1'], beta: ['b1'] } }),
    );

    const { result: hook, rerender } = renderUseAgents();

    await waitFor(() => expect(hook.current.rows).toHaveLength(2));

    // Then the reachable set narrows and only alpha is queried — beta's agents
    // must not vanish from the table.
    mockUseResources.mockReturnValue(result({ succeeded: { alpha: ['a1'] } }));
    rerender();

    await waitFor(() =>
      expect(hook.current.rows.map(r => r.name).sort()).toEqual(['a1', 'b1']),
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
