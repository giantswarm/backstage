import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useListResources } from './useListResources';

const CLUSTER = 'gazelle';

const gvk: CustomResourceMatcher = {
  group: 'helm.toolkit.fluxcd.io',
  apiVersion: 'v2',
  plural: 'helmreleases',
  isCore: false,
};

function createKubernetesApi() {
  const proxy = jest.fn(async ({ path }: { path: string }) => {
    // Echo the requested path back as an item name, so a response can be traced
    // to the request that produced it.
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [{ metadata: { name: path } }] }),
    } as unknown as Response;
  });

  return { api: { proxy } as any, proxy };
}

/**
 * One QueryClient shared across renders, with a non-zero `staleTime` — the
 * condition under which a cache collision is silent, because a hit issues no
 * request at all. Mirrors the plugin clients (60s).
 */
function renderWithSharedCache() {
  const { api, proxy } = createKubernetesApi();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: false } },
  });

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, api]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );

  const list = (namespace: string) =>
    renderHook(
      () =>
        useListResources<{ metadata: { name: string } }>(
          [CLUSTER],
          { [CLUSTER]: gvk },
          { [CLUSTER]: { namespace } },
        ),
      { wrapper },
    );

  return { list, proxy };
}

describe('useListResources', () => {
  it('does not serve one namespace’s list from another namespace’s cache entry', async () => {
    // Regression. The key omitted the namespace while the *path* carried it, so
    // two lists of the same kind on one cluster were a single query: the second
    // caller got the first one's items and no request was made. That is
    // dangerous well beyond a display glitch — a caller deciding "nothing else
    // references this, so it is safe to delete" could be answered from an
    // entirely different namespace.
    const { list, proxy } = renderWithSharedCache();

    const teamA = list('team-a');
    await waitFor(() => expect(teamA.result.current.isLoading).toBe(false));

    const teamB = list('team-b');
    await waitFor(() => expect(teamB.result.current.isLoading).toBe(false));

    expect(proxy).toHaveBeenCalledTimes(2);

    const paths = proxy.mock.calls.map(call => call[0].path);
    expect(paths[0]).toContain('/namespaces/team-a/');
    expect(paths[1]).toContain('/namespaces/team-b/');

    // Each hook holds its own namespace's items.
    const nameFor = (r: ReturnType<typeof list>) =>
      r.result.current.clustersData[0]?.data[0]?.metadata.name ?? '';
    expect(nameFor(teamA)).toContain('/namespaces/team-a/');
    expect(nameFor(teamB)).toContain('/namespaces/team-b/');
  });

  it('still shares a cache entry for the same namespace', async () => {
    // The caching this exists for is unaffected: an identical scope is one query.
    const { list, proxy } = renderWithSharedCache();

    const first = list('team-a');
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    const second = list('team-a');
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(proxy).toHaveBeenCalledTimes(1);
  });
});
