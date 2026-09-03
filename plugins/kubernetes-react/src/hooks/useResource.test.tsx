import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { renderHook, waitFor } from '@testing-library/react';
import { App } from '../lib/k8s/App';
import { useResource } from './useResource';

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

// Mirrors the app's setup (see the plugin QueryClientProviders), where the
// query client sits behind a PersistQueryClientProvider with an async
// persister. The async restore phase is load-bearing for the regression test
// below: while restoring, enabled queries are mounted but hold off fetching
// (fetchStatus 'idle'), and when the restore completes they all start at
// once — exactly the window in which discovery must not be considered
// settled.
function createWrapper(
  kubernetesApi: ReturnType<typeof createMockKubernetesApi>,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const storage = new Map<string, string>();
  const persister = createAsyncStoragePersister({
    storage: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: async (key: string) => {
        storage.delete(key);
      },
    },
  });

  return function Wrapper({ children }: { children?: React.ReactNode }) {
    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <TestApiProvider apis={[[kubernetesApiRef, kubernetesApi]]}>
          {children}
        </TestApiProvider>
      </PersistQueryClientProvider>
    );
  };
}

const appGroupResponse = {
  name: 'application.giantswarm.io',
  versions: [
    {
      groupVersion: 'application.giantswarm.io/v1alpha1',
      version: 'v1alpha1',
    },
  ],
  preferredVersion: {
    groupVersion: 'application.giantswarm.io/v1alpha1',
    version: 'v1alpha1',
  },
};

const appResourcesResponse = {
  groupVersion: 'application.giantswarm.io/v1alpha1',
  resources: [
    {
      name: 'apps',
      singularName: 'app',
      namespaced: true,
      kind: 'App',
      verbs: ['get', 'list'],
    },
  ],
};

const appResponse = {
  apiVersion: 'application.giantswarm.io/v1alpha1',
  kind: 'App',
  metadata: { name: 'my-app', namespace: 'org-test' },
  spec: { name: 'my-app', namespace: 'org-test' },
};

describe('useResource', () => {
  it('fetches the resource once discovery resolves the API version', async () => {
    const api = createMockKubernetesApi({
      'cluster-a': {
        '/apis/application.giantswarm.io': appGroupResponse,
        '/apis/application.giantswarm.io/v1alpha1': appResourcesResponse,
        '/apis/application.giantswarm.io/v1alpha1/namespaces/org-test/apps/my-app/':
          appResponse,
      },
    });

    const { result } = renderHook(
      () =>
        useResource('cluster-a', App, {
          name: 'my-app',
          namespace: 'org-test',
        }),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.resource).toBeDefined();
    });

    expect(result.current.resource?.getName()).toBe('my-app');
    expect(result.current.error).toBeNull();
  });

  it('never requests the resource when the API group is not served (404)', async () => {
    // A standalone installation without app-platform: /apis/application.giantswarm.io
    // 404s (the mock's default for unknown paths). Discovery must settle first
    // and resolve no GVK, so the resource GET is never sent — otherwise its 404
    // error sticks in the query cache and surfaces as a permanent error state.
    const api = createMockKubernetesApi({ 'cluster-a': {} });

    const { result } = renderHook(
      () =>
        useResource('cluster-a', App, {
          name: 'my-app',
          namespace: 'org-test',
        }),
      { wrapper: createWrapper(api) },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const requestedPaths = api.proxy.mock.calls.map(
      ([{ path }]: [ProxyArgs]) => path,
    );
    expect(requestedPaths).toContain('/apis/application.giantswarm.io');
    expect(
      requestedPaths.filter(path => path.includes('/namespaces/')),
    ).toEqual([]);

    expect(result.current.resource).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.discoveryErrors).toEqual([
      expect.objectContaining({
        cluster: 'cluster-a',
        error: expect.objectContaining({ name: 'NotFoundError' }),
      }),
    ]);
  });
});
