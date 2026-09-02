import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { podListPath, usePodLists } from './usePodLists';

function createKubernetesApi() {
  const proxy = jest.fn(
    async ({ clusterName, path }: { clusterName: string; path: string }) => {
      if (clusterName === 'forbidden') {
        return {
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({}),
        } as unknown as Response;
      }
      // Echo the path into the pod name so a result traces to its request.
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              apiVersion: 'v1',
              kind: 'Pod',
              metadata: { name: path, namespace: 'kserve' },
              spec: { nodeName: 'gpu-node-1' },
            },
          ],
        }),
      } as unknown as Response;
    },
  );
  return { api: { proxy } as any, proxy };
}

function renderWith(requests: Parameters<typeof usePodLists>[0]) {
  const { api, proxy } = createKubernetesApi();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, api]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return { proxy, ...renderHook(() => usePodLists(requests), { wrapper }) };
}

describe('podListPath', () => {
  it('builds cluster-wide and namespaced paths with encoded selectors', () => {
    expect(podListPath({ installation: 'a' })).toBe('/api/v1/pods');
    expect(
      podListPath({
        installation: 'a',
        labelSelector: 'serving.kserve.io/inferenceservice',
      }),
    ).toBe('/api/v1/pods?labelSelector=serving.kserve.io%2Finferenceservice');
    expect(
      podListPath({
        installation: 'a',
        namespace: 'kserve',
        fieldSelector: 'spec.nodeName=gpu-node-1',
      }),
    ).toBe(
      '/api/v1/namespaces/kserve/pods?fieldSelector=spec.nodeName%3Dgpu-node-1',
    );
  });
});

describe('usePodLists', () => {
  it('runs one list per request and hydrates Pod instances', async () => {
    const { result, proxy } = renderWith([
      {
        installation: 'alpha',
        labelSelector: 'serving.kserve.io/inferenceservice',
      },
      { installation: 'alpha', fieldSelector: 'spec.nodeName=gpu-node-1' },
    ]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(proxy).toHaveBeenCalledTimes(2);
    expect(result.current.results).toHaveLength(2);
    const [byLabel, byNode] = result.current.results;
    expect(byLabel.pods?.[0].getName()).toBe(
      '/api/v1/pods?labelSelector=serving.kserve.io%2Finferenceservice',
    );
    expect(byLabel.pods?.[0].cluster).toBe('alpha');
    expect(byNode.pods?.[0].getNodeName()).toBe('gpu-node-1');
  });

  it('reports a forbidden list as ForbiddenError without pods', async () => {
    const { result } = renderWith([{ installation: 'forbidden' }]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.results[0].pods).toBeUndefined();
    expect(result.current.results[0].error?.name).toBe('ForbiddenError');
  });

  it('is idle with no requests', () => {
    const { result, proxy } = renderWith([]);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(proxy).not.toHaveBeenCalled();
  });
});
