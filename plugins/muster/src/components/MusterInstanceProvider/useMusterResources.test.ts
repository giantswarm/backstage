import { renderHook } from '@testing-library/react';
import { MUSTER_NAMESPACE, useMusterResources } from './useMusterResources';

type Read = {
  resources: unknown[];
  errors: unknown[];
  isLoading?: boolean;
};

// What the API server answers: the cluster-wide list, and the list in muster's
// namespace. Each `useResources` call is told apart by its options: a
// namespaced read names the namespace per cluster.
let mockClusterWide: Read;
let mockNamespaced: Read;
const mockNamespacedCalls: Array<{
  clusters: string[];
  options: Record<string, { namespace?: string }>;
  enabled?: boolean;
}> = [];
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  useResources: (
    clusters: string[],
    _resource: unknown,
    options: Record<string, { namespace?: string }>,
    queryOptions: { enabled?: boolean },
  ) => {
    const isNamespaced = Object.keys(options).length > 0;
    if (clusters.length === 0 || queryOptions.enabled === false) {
      return {
        resources: [],
        errors: [],
        queries: [],
        isLoading: false,
        retry: jest.fn(),
      };
    }
    if (isNamespaced) {
      mockNamespacedCalls.push({
        clusters,
        options,
        enabled: queryOptions.enabled,
      });
    }
    const read = isNamespaced ? mockNamespaced : mockClusterWide;
    return {
      resources: read.resources,
      errors: read.errors,
      queries: [],
      isLoading: read.isLoading ?? false,
      retry: jest.fn(),
    };
  },
}));

class Fake {
  static getGVK() {
    return { group: 'muster.giantswarm.io', plural: 'workflows' };
  }
}

const forbidden = (cluster: string) => ({
  cluster,
  error: { name: 'ForbiddenError', message: 'forbidden' },
});
const failed = (cluster: string) => ({
  cluster,
  error: { name: 'Error', message: 'boom' },
});

function render() {
  return renderHook(() =>
    useMusterResources(['gazelle'], Fake as never, {
      refetchInterval: 30_000,
    }),
  );
}

describe('useMusterResources', () => {
  beforeEach(() => {
    mockNamespacedCalls.length = 0;
    mockNamespaced = { resources: [], errors: [] };
  });

  it('reads cluster-wide, and nothing namespaced, when the person may list it', () => {
    mockClusterWide = { resources: ['a', 'b'], errors: [] };

    const { result } = render();

    expect(result.current.resources).toEqual(['a', 'b']);
    expect(result.current.errors).toEqual([]);
    expect(mockNamespacedCalls).toHaveLength(0);
  });

  it('reads muster’s namespace instead of a 403 for a namespaced agent-platform:user', () => {
    mockClusterWide = { resources: [], errors: [forbidden('gazelle')] };
    mockNamespaced = { resources: ['mine'], errors: [] };

    const { result } = render();

    expect(mockNamespacedCalls[0]).toEqual({
      clusters: ['gazelle'],
      options: { gazelle: { namespace: MUSTER_NAMESPACE } },
      enabled: true,
    });
    expect(result.current.resources).toEqual(['mine']);
    expect(result.current.errors).toEqual([]);
  });

  it('shows an empty list, not a 403, when muster’s namespace refuses too', () => {
    mockClusterWide = { resources: [], errors: [forbidden('gazelle')] };
    mockNamespaced = { resources: [], errors: [forbidden('gazelle')] };

    const { result } = render();

    expect(result.current.resources).toEqual([]);
    expect(result.current.errors).toEqual([]);
  });

  it('keeps loading while the namespaced read has not answered', () => {
    mockClusterWide = { resources: [], errors: [forbidden('gazelle')] };
    mockNamespaced = { resources: [], errors: [], isLoading: true };

    const { result } = render();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.errors).toEqual([]);
  });

  it('reports any other failure as it is', () => {
    mockClusterWide = { resources: [], errors: [forbidden('gazelle')] };
    mockNamespaced = { resources: [], errors: [failed('gazelle')] };

    const { result } = render();

    expect(result.current.errors).toEqual([failed('gazelle')]);
  });
});
