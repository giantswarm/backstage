import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { mimirApiRef, MimirMetricSample } from '../../apis/mimir';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../../apis/installations/installationsConfig';
import {
  KubeDeploymentSpecReplicas,
  KubeDeploymentStatusReplicasReady,
} from '../../apis/mimir/metrics';
import { buildWorkloadQuery, useMimirWorkloads } from './useMimirWorkloads';

const INSTALLATION = 'golem';
// 3 workload kinds × 4 metrics
const QUERIES_PER_INSTALLATION = 12;

const mimirApi = { query: jest.fn(), queryRange: jest.fn() };

function wrapper({ children }: { children: ReactNode }) {
  // The retry policy is the hook's; only the backoff is shortened.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return (
    <TestApiProvider
      apis={[
        [
          kubernetesApiRef,
          {
            getCluster: jest.fn(async () => ({
              name: INSTALLATION,
              authProvider: 'oidc',
              oidcTokenProvider: 'gs',
            })),
          },
        ],
        [mimirApiRef, mimirApi],
        [
          kubernetesAuthProvidersApiRef,
          {
            getCredentials: jest.fn(async () => ({ token: 'token' })),
            decorateRequestBodyForAuth: jest.fn(),
          },
        ],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

function sample(
  metric: Record<string, string>,
  value: string,
): MimirMetricSample {
  return { metric, value: [1234567890, value] };
}

function respondWith(samplesByMetric: Record<string, MimirMetricSample[]>) {
  mimirApi.query.mockImplementation(async ({ query }: { query: string }) => {
    const metric = Object.keys(samplesByMetric).find(name =>
      query.includes(`(${name}{`),
    );
    return {
      status: 'success',
      data: {
        resultType: 'vector',
        result: metric ? samplesByMetric[metric] : [],
      },
    };
  });
}

const queriesSent = () =>
  mimirApi.query.mock.calls.map(([params]) => params.query as string);

describe('buildWorkloadQuery', () => {
  it('scopes the metric to the given clusters', () => {
    expect(
      buildWorkloadQuery('kube_deployment_spec_replicas', ['golem', 'wc1']),
    ).toBe(
      'max without(app, container, customer, endpoint, instance, job, pipeline, pod, provider, region, service, service_priority) ' +
        '(kube_deployment_spec_replicas{cluster_id=~"golem|wc1"})',
    );
  });

  it('keeps a cluster id from breaking out of the matcher', () => {
    expect(buildWorkloadQuery('m', ['wc"}'])).toContain('{cluster_id=~"wc"}');
  });
});

describe('useMimirWorkloads', () => {
  beforeEach(() => {
    __resetInstallationsConfigForTests();
    setInstallationsConfig([{ name: INSTALLATION }]);
    mimirApi.query.mockReset();
  });

  it('scopes every workload query to the clusters the installation shows', async () => {
    respondWith({});

    const { result } = renderHook(
      () =>
        useMimirWorkloads({
          clustersByInstallation: { [INSTALLATION]: ['wc1', 'golem', 'wc1'] },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const queries = queriesSent();
    expect(queries).toHaveLength(QUERIES_PER_INSTALLATION);
    for (const query of queries) {
      expect(query).toMatch(/\{cluster_id=~"golem\|wc1"\}\)$/);
    }
    expect(result.current.errors).toEqual([]);
  });

  it('queries nothing and reports loading while the clusters are unknown', () => {
    const { result } = renderHook(
      () => useMimirWorkloads({ clustersByInstallation: undefined }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);
    expect(mimirApi.query).not.toHaveBeenCalled();
  });

  it('skips an installation that shows no cluster', async () => {
    const { result } = renderHook(
      () =>
        useMimirWorkloads({ clustersByInstallation: { [INSTALLATION]: [] } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mimirApi.query).not.toHaveBeenCalled();
    expect(result.current.workloads).toEqual([]);
  });

  it('skips an installation without Mimir', async () => {
    setInstallationsConfig([{ name: INSTALLATION, mimirEnabled: false }]);

    const { result } = renderHook(
      () =>
        useMimirWorkloads({
          clustersByInstallation: { [INSTALLATION]: ['golem'] },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mimirApi.query).not.toHaveBeenCalled();
  });

  it('merges the samples of a cluster into its workloads', async () => {
    respondWith({
      [KubeDeploymentSpecReplicas.name]: [
        sample(
          { cluster_id: 'wc1', namespace: 'default', deployment: 'my-app' },
          '3',
        ),
      ],
      [KubeDeploymentStatusReplicasReady.name]: [
        sample(
          { cluster_id: 'wc1', namespace: 'default', deployment: 'my-app' },
          '2',
        ),
      ],
    });

    const { result } = renderHook(
      () =>
        useMimirWorkloads({
          clustersByInstallation: { [INSTALLATION]: ['wc1'] },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.workloads).toEqual([
      expect.objectContaining({
        installationName: INSTALLATION,
        kind: 'deployment',
        name: 'my-app',
        namespace: 'default',
        clusterName: 'wc1',
        desiredReplicas: 3,
        readyReplicas: 2,
      }),
    ]);
  });

  it('retries a timed-out query once', async () => {
    mimirApi.query.mockRejectedValue(
      new Error('Mimir request timed out after 30000ms'),
    );

    const { result } = renderHook(
      () =>
        useMimirWorkloads({
          clustersByInstallation: { [INSTALLATION]: ['golem'] },
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.errors).toHaveLength(QUERIES_PER_INSTALLATION),
    );
    // Every query: the first attempt and one retry.
    expect(mimirApi.query).toHaveBeenCalledTimes(2 * QUERIES_PER_INSTALLATION);
  });

  it('never retries a forbidden query', async () => {
    const forbidden = new Error('forbidden');
    forbidden.name = 'ForbiddenError';
    mimirApi.query.mockRejectedValue(forbidden);

    const { result } = renderHook(
      () =>
        useMimirWorkloads({
          clustersByInstallation: { [INSTALLATION]: ['golem'] },
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.errors).toHaveLength(QUERIES_PER_INSTALLATION),
    );
    expect(mimirApi.query).toHaveBeenCalledTimes(QUERIES_PER_INSTALLATION);
  });
});
