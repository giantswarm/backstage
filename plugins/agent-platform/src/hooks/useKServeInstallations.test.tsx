import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  KSERVE_PROBE_PATH,
  useKServeInstallations,
} from './useKServeInstallations';

/** Per-installation canned discovery answers. */
type Answer =
  { status: 200; resources: string[] } | { status: 403 | 404 | 500 | 502 };

function createKubernetesApi(answers: Record<string, Answer>) {
  const proxy = jest.fn(
    async ({ clusterName, path }: { clusterName: string; path: string }) => {
      const answer = answers[clusterName];
      if (!answer) {
        throw new Error(`unexpected probe of ${clusterName} at ${path}`);
      }
      if (answer.status === 200) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            resources: answer.resources.map(name => ({ name })),
          }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: answer.status,
        statusText: '',
        json: async () => ({}),
      } as unknown as Response;
    },
  );
  return { api: { proxy } as any, proxy };
}

function renderWith(installations: string[], answers: Record<string, Answer>) {
  const { api, proxy } = createKubernetesApi(answers);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, api]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    proxy,
    ...renderHook(() => useKServeInstallations(installations), { wrapper }),
  };
}

describe('useKServeInstallations', () => {
  it('asks each installation for the served KServe resources', async () => {
    const { result, proxy } = renderWith(['alpha'], {
      alpha: {
        status: 200,
        resources: ['inferenceservices', 'servingruntimes'],
      },
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'alpha',
      path: KSERVE_PROBE_PATH,
    });
    expect(KSERVE_PROBE_PATH).toBe('/apis/serving.kserve.io/v1beta1');
    expect(result.current.installations).toEqual(['alpha']);
  });

  it('keeps only installations whose discovery lists inferenceservices', async () => {
    const { result } = renderWith(['alpha', 'beta', 'gamma'], {
      alpha: { status: 200, resources: ['inferenceservices'] },
      // The group is served but without the CRD (e.g. only ServingRuntimes).
      beta: { status: 200, resources: ['servingruntimes'] },
      gamma: { status: 404 },
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(result.current.installations).toEqual(['alpha']);
    expect(result.current.errors).toEqual([]);
  });

  it('treats 404 and 403 as "no KServe here", not as failures', async () => {
    const { result } = renderWith(['no-crd', 'forbidden'], {
      'no-crd': { status: 404 },
      forbidden: { status: 403 },
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(result.current.installations).toEqual([]);
    expect(result.current.errors).toEqual([]);
  });

  it('reports installations whose probe failed outright', async () => {
    const { result } = renderWith(['alpha', 'down'], {
      alpha: { status: 200, resources: ['inferenceservices'] },
      down: { status: 502 },
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(result.current.installations).toEqual(['alpha']);
    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].installation).toBe('down');
    expect(result.current.errors[0].error.message).toContain('HTTP 502');
  });

  it('probes each installation once, then serves the cached verdict', async () => {
    const { result, proxy, rerender } = renderWith(['alpha'], {
      alpha: { status: 404 },
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));
    rerender();

    expect(proxy).toHaveBeenCalledTimes(1);
  });
});
