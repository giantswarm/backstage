import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useSelfSubjectAccessReview } from './useSelfSubjectAccessReview';

const resourceAttributes = {
  group: 'kustomize.toolkit.fluxcd.io',
  resource: 'kustomizations',
  namespace: 'flux-system',
  verb: 'patch',
};

function createMockKubernetesApi(allowed: boolean | Error = true) {
  return {
    proxy: jest.fn(async () => {
      if (allowed instanceof Error) {
        throw allowed;
      }

      return {
        ok: true,
        status: 201,
        json: async () => ({ status: { allowed } }),
      } as Response;
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
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider apis={[[kubernetesApiRef, kubernetesApi]]}>
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );

  return { Wrapper, queryClient };
}

describe('useSelfSubjectAccessReview', () => {
  it('reports allowed when the review permits the verb', async () => {
    const api = createMockKubernetesApi(true);
    const { Wrapper } = createWrapper(api);

    const { result } = renderHook(
      () => useSelfSubjectAccessReview('test-installation', resourceAttributes),
      { wrapper: Wrapper },
    );

    // Fails closed while the review is in flight.
    expect(result.current.allowed).toBe(false);
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.allowed).toBe(true));
  });

  it('reports not allowed when the review denies the verb', async () => {
    const api = createMockKubernetesApi(false);
    const { Wrapper } = createWrapper(api);

    const { result } = renderHook(
      () => useSelfSubjectAccessReview('test-installation', resourceAttributes),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.allowed).toBe(false);
  });

  it('reports not allowed when the review fails', async () => {
    const api = createMockKubernetesApi(new Error('cluster unreachable'));
    const { Wrapper } = createWrapper(api);

    const { result } = renderHook(
      () => useSelfSubjectAccessReview('test-installation', resourceAttributes),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.allowed).toBe(false);
  });

  it('issues no review when disabled', async () => {
    const api = createMockKubernetesApi(true);
    const { Wrapper } = createWrapper(api);

    renderHook(
      () =>
        useSelfSubjectAccessReview('test-installation', resourceAttributes, {
          enabled: false,
        }),
      { wrapper: Wrapper },
    );

    expect(api.proxy).not.toHaveBeenCalled();
  });

  it('shares one review across resources of the same kind and namespace', async () => {
    const api = createMockKubernetesApi(true);
    const { Wrapper } = createWrapper(api);

    const { result } = renderHook(
      () => ({
        first: useSelfSubjectAccessReview(
          'test-installation',
          resourceAttributes,
        ),
        second: useSelfSubjectAccessReview(
          'test-installation',
          resourceAttributes,
        ),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.first.allowed).toBe(true));
    expect(result.current.second.allowed).toBe(true);
    expect(api.proxy).toHaveBeenCalledTimes(1);
  });

  it('does not register under the "cluster" query key prefix', async () => {
    // `useClusterQueries` treats every active query keyed by 'cluster' as a
    // cluster read, and would otherwise surface a permission probe as a
    // per-cluster loading/error banner.
    const api = createMockKubernetesApi(true);
    const { Wrapper, queryClient } = createWrapper(api);

    const { result } = renderHook(
      () => useSelfSubjectAccessReview('test-installation', resourceAttributes),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.allowed).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map(query => query.queryKey);

    expect(keys).toHaveLength(1);
    expect(keys[0][0]).toBe('selfSubjectAccessReview');
  });
});
