import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { APIGroup, APIResourceList } from '../../lib/k8s/ApiDiscovery';
import { usePreferredVersions } from './usePreferredVersions';

// --- Test helpers ---

function makeGVK(
  overrides: Partial<CustomResourceMatcher> = {},
): CustomResourceMatcher {
  return {
    group: 'test.example.io',
    apiVersion: 'v1beta1',
    plural: 'testresources',
    isCore: false,
    ...overrides,
  };
}

function makeMultiVersionGVK(
  supportedVersions: string[],
  overrides: Partial<CustomResourceMatcher> = {},
) {
  return {
    ...makeGVK(overrides),
    supportedVersions,
  };
}

function makeApiGroupResponse(
  group: string,
  versions: string[],
  preferredVersion?: string,
): APIGroup {
  return {
    name: group,
    versions: versions.map(v => ({
      groupVersion: `${group}/${v}`,
      version: v,
    })),
    preferredVersion: {
      groupVersion: `${group}/${preferredVersion ?? versions[0]}`,
      version: preferredVersion ?? versions[0],
    },
  };
}

function makeApiResourceResponse(
  group: string,
  version: string,
  resourcePlurals: string[],
): APIResourceList {
  return {
    groupVersion: `${group}/${version}`,
    resources: resourcePlurals.map(name => ({
      name,
      singularName: name.slice(0, -1),
      namespaced: true,
      kind: name.charAt(0).toUpperCase() + name.slice(1, -1),
      verbs: ['get', 'list'],
    })),
  };
}

function mockResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

type ProxyArgs = { clusterName: string; path: string };
type ProxyResponses = Record<string, Record<string, unknown>>;

function createMockKubernetesApi(responses: ProxyResponses) {
  return {
    proxy: jest.fn(async ({ clusterName, path }: ProxyArgs) => {
      const clusterResponses = responses[clusterName];
      if (clusterResponses && path in clusterResponses) {
        return mockResponse(clusterResponses[path]);
      }
      return { ok: false, status: 404, statusText: 'Not Found' } as Response;
    }),
    getObjectsByEntity: jest.fn(),
    getClusters: jest.fn(),
    getCluster: jest.fn(),
    getWorkloadsByEntity: jest.fn(),
    getCustomObjectsByEntity: jest.fn(),
  };
}

function createWrapper(
  kubernetesApi: ReturnType<typeof createMockKubernetesApi>,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children?: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TestApiProvider apis={[[kubernetesApiRef, kubernetesApi]]}>
          {children}
        </TestApiProvider>
      </QueryClientProvider>
    );
  };
}

// --- Tests ---

describe('usePreferredVersions', () => {
  it('resolves version for a single cluster with a single version', async () => {
    const gvk = makeGVK({
      group: 'test.example.io',
      apiVersion: 'v1beta1',
      plural: 'widgets',
    });

    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1beta1',
        ]),
        '/apis/test.example.io/v1beta1': makeApiResourceResponse(
          'test.example.io',
          'v1beta1',
          ['widgets'],
        ),
      },
    });

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isDiscovering).toBe(false);
    });

    expect(result.current.clustersGVKs).toEqual({
      'cluster-a': expect.objectContaining({
        group: 'test.example.io',
        apiVersion: 'v1beta1',
        plural: 'widgets',
      }),
    });
    expect(result.current.incompatibilities).toEqual([]);
    expect(result.current.clientOutdatedStates).toEqual([]);
  });

  it('resolves versions for multiple clusters independently', async () => {
    const gvk = makeGVK({
      group: 'test.example.io',
      apiVersion: 'v1beta1',
      plural: 'widgets',
    });

    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1beta1',
        ]),
        '/apis/test.example.io/v1beta1': makeApiResourceResponse(
          'test.example.io',
          'v1beta1',
          ['widgets'],
        ),
      },
      'cluster-b': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1beta1',
        ]),
        '/apis/test.example.io/v1beta1': makeApiResourceResponse(
          'test.example.io',
          'v1beta1',
          ['widgets'],
        ),
      },
    });

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a', 'cluster-b'], gvk),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isDiscovering).toBe(false);
    });

    expect(Object.keys(result.current.clustersGVKs)).toEqual([
      'cluster-a',
      'cluster-b',
    ]);
    expect(result.current.clustersGVKs['cluster-a'].apiVersion).toBe('v1beta1');
    expect(result.current.clustersGVKs['cluster-b'].apiVersion).toBe('v1beta1');
  });

  it('resolves to newest compatible version for multi-version resource', async () => {
    const gvk = makeMultiVersionGVK(['v1beta1', 'v1beta2'], {
      group: 'test.example.io',
      apiVersion: 'v1beta1',
      plural: 'widgets',
    });

    // Server has v1beta1, v1beta2, v1 — client supports v1beta1 and v1beta2
    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1beta1',
          'v1beta2',
          'v1',
        ]),
        '/apis/test.example.io/v1beta1': makeApiResourceResponse(
          'test.example.io',
          'v1beta1',
          ['widgets'],
        ),
        '/apis/test.example.io/v1beta2': makeApiResourceResponse(
          'test.example.io',
          'v1beta2',
          ['widgets'],
        ),
      },
    });

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isDiscovering).toBe(false);
    });

    // Should pick v1beta2 as the newest compatible version
    expect(result.current.clustersGVKs['cluster-a'].apiVersion).toBe('v1beta2');
    expect(result.current.incompatibilities).toEqual([]);
    // Server group has v1 but the resource doesn't exist at v1 (no mock),
    // so no client-outdated warning should fire
    expect(result.current.clientOutdatedStates).toEqual([]);
  });

  it('falls back to static GVK when no compatible versions found in group', async () => {
    const gvk = makeGVK({
      group: 'test.example.io',
      apiVersion: 'v1beta1',
      plural: 'widgets',
    });

    // Server only has v1 — client only supports v1beta1 → no intersection
    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1',
        ]),
      },
    });

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isDiscovering).toBe(false);
    });

    // When no versions overlap at the group level, Stage 2 never runs.
    // serverVersions is empty so resolvePreferredVersion falls back to static GVK.
    expect(result.current.clustersGVKs['cluster-a']).toEqual(
      expect.objectContaining({
        apiVersion: 'v1beta1',
      }),
    );
  });

  it('reports incompatibility when resource exists only in incompatible versions', async () => {
    const gvk = makeMultiVersionGVK(['v1beta1'], {
      group: 'test.example.io',
      apiVersion: 'v1beta1',
      plural: 'widgets',
    });

    // Server has v1beta1 and v1beta2 at the group level, but the resource
    // only exists at v1beta2 (not v1beta1 which client supports)
    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1beta1',
          'v1beta2',
        ]),
        '/apis/test.example.io/v1beta1': makeApiResourceResponse(
          'test.example.io',
          'v1beta1',
          ['otherresources'], // widgets not here
        ),
        '/apis/test.example.io/v1beta2': makeApiResourceResponse(
          'test.example.io',
          'v1beta2',
          ['widgets'], // widgets exists here, but client doesn't support v1beta2
        ),
      },
    });

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isDiscovering).toBe(false);
    });

    // Resource exists only at v1beta2 but client only supports v1beta1
    // → incompatible, excluded from clustersGVKs
    expect(result.current.clustersGVKs['cluster-a']).toBeUndefined();
    expect(result.current.incompatibilities).toHaveLength(1);
    expect(result.current.incompatibilities[0]).toEqual(
      expect.objectContaining({
        cluster: 'cluster-a',
        clientVersions: ['v1beta1'],
        serverVersions: ['v1beta2'],
      }),
    );
  });

  it('does not report client-outdated when resource does not exist at newer group version', async () => {
    // This is the false positive scenario: group advertises v1 but the
    // resource only exists at v1beta1 and v1beta2
    const gvk = makeMultiVersionGVK(['v1beta1', 'v1beta2'], {
      group: 'test.example.io',
      apiVersion: 'v1beta1',
      plural: 'widgets',
    });

    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1beta1',
          'v1beta2',
          'v1',
        ]),
        '/apis/test.example.io/v1beta1': makeApiResourceResponse(
          'test.example.io',
          'v1beta1',
          ['widgets'],
        ),
        '/apis/test.example.io/v1beta2': makeApiResourceResponse(
          'test.example.io',
          'v1beta2',
          ['widgets'],
        ),
        // v1 exists at the group level but the resource is NOT served there
        '/apis/test.example.io/v1': makeApiResourceResponse(
          'test.example.io',
          'v1',
          ['otherresources'],
        ),
      },
    });

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isDiscovering).toBe(false);
    });

    expect(result.current.clustersGVKs['cluster-a'].apiVersion).toBe('v1beta2');
    // No client-outdated: the resource doesn't exist at v1
    expect(result.current.clientOutdatedStates).toEqual([]);
  });

  it('reports client-outdated when resource exists at a version beyond client support', async () => {
    const gvk = makeMultiVersionGVK(['v1beta1'], {
      group: 'test.example.io',
      apiVersion: 'v1beta1',
      plural: 'widgets',
    });

    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/test.example.io': makeApiGroupResponse('test.example.io', [
          'v1beta1',
          'v1',
        ]),
        '/apis/test.example.io/v1beta1': makeApiResourceResponse(
          'test.example.io',
          'v1beta1',
          ['widgets'],
        ),
        '/apis/test.example.io/v1': makeApiResourceResponse(
          'test.example.io',
          'v1',
          ['widgets'], // resource exists at v1 too
        ),
      },
    });

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isDiscovering).toBe(false);
    });

    expect(result.current.clustersGVKs['cluster-a'].apiVersion).toBe('v1beta1');
    expect(result.current.clientOutdatedStates).toHaveLength(1);
    expect(result.current.clientOutdatedStates[0]).toEqual(
      expect.objectContaining({
        cluster: 'cluster-a',
        clientLatestVersion: 'v1beta1',
        serverLatestVersion: 'v1',
      }),
    );
  });

  it('is discovering while queries are loading', () => {
    const gvk = makeGVK();

    // Create an API that never resolves
    const api = {
      proxy: jest.fn(
        (_args: ProxyArgs) => new Promise<Response>(() => {}), // never resolves
      ),
      getObjectsByEntity: jest.fn(),
      getClusters: jest.fn(),
      getCluster: jest.fn(),
      getWorkloadsByEntity: jest.fn(),
      getCustomObjectsByEntity: jest.fn(),
    };

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    expect(result.current.isDiscovering).toBe(true);
  });

  it('skips discovery for core APIs and returns static GVK', () => {
    const gvk = makeGVK({ isCore: true });

    const api = createMockKubernetesApi({});

    const { result } = renderHook(
      () => usePreferredVersions(['cluster-a'], gvk),
      { wrapper: createWrapper(api) },
    );

    // Should not be discovering — core APIs skip discovery
    expect(result.current.isDiscovering).toBe(false);
    expect(result.current.clustersGVKs['cluster-a']).toEqual(
      expect.objectContaining({
        apiVersion: gvk.apiVersion,
        isCore: true,
      }),
    );
    // proxy should never be called
    expect(api.proxy).not.toHaveBeenCalled();
  });
});
