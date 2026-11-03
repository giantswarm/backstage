import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { mimirApiRef } from '../../apis/mimir';
import { getClusterKey, useWorkerCapacity } from './useWorkerCapacity';

const HEALTHY = 'installation-a';
const HUNG = 'installation-b';

function vsphereCluster(installationName: string) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: { name: 'my-cluster', namespace: 'org-test' },
      spec: {
        infrastructureRef: {
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'VSphereCluster',
          name: 'my-cluster',
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    installationName,
  );
}

const responses: Record<string, unknown> = {
  '/apis/cluster.x-k8s.io': {
    name: 'cluster.x-k8s.io',
    versions: [
      { groupVersion: 'cluster.x-k8s.io/v1beta2', version: 'v1beta2' },
    ],
    preferredVersion: {
      groupVersion: 'cluster.x-k8s.io/v1beta2',
      version: 'v1beta2',
    },
  },
  '/apis/cluster.x-k8s.io/v1beta2': {
    groupVersion: 'cluster.x-k8s.io/v1beta2',
    resources: [
      {
        name: 'machinedeployments',
        singularName: 'machinedeployment',
        namespaced: true,
        kind: 'MachineDeployment',
        verbs: ['get', 'list'],
      },
    ],
  },
  '/apis/infrastructure.cluster.x-k8s.io': {
    name: 'infrastructure.cluster.x-k8s.io',
    versions: [
      {
        groupVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
        version: 'v1beta1',
      },
    ],
    preferredVersion: {
      groupVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
      version: 'v1beta1',
    },
  },
  '/apis/infrastructure.cluster.x-k8s.io/v1beta1': {
    groupVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
    resources: [
      {
        name: 'vspheremachinetemplates',
        singularName: 'vspheremachinetemplate',
        namespaced: true,
        kind: 'VSphereMachineTemplate',
        verbs: ['get', 'list'],
      },
    ],
  },
  [`/apis/cluster.x-k8s.io/v1beta2/namespaces/org-test/machinedeployments/?${new URLSearchParams(
    { labelSelector: 'cluster.x-k8s.io/cluster-name=my-cluster' },
  )}`]: {
    items: [
      {
        apiVersion: 'cluster.x-k8s.io/v1beta2',
        kind: 'MachineDeployment',
        metadata: {
          name: 'my-cluster-worker',
          namespace: 'org-test',
          labels: { 'cluster.x-k8s.io/cluster-name': 'my-cluster' },
        },
        spec: {
          template: {
            spec: {
              infrastructureRef: {
                apiGroup: 'infrastructure.cluster.x-k8s.io',
                kind: 'VSphereMachineTemplate',
                name: 'my-cluster-worker-abc',
              },
            },
          },
        },
        status: { readyReplicas: 2 },
      },
    ],
  },
  '/apis/infrastructure.cluster.x-k8s.io/v1beta1/namespaces/org-test/vspheremachinetemplates/':
    {
      items: [
        {
          apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
          kind: 'VSphereMachineTemplate',
          metadata: { name: 'my-cluster-worker-abc', namespace: 'org-test' },
          spec: {
            template: {
              spec: {
                template: 'flatcar',
                numCPUs: 4,
                memoryMiB: 8192,
                network: { devices: [] },
              },
            },
          },
        },
      ],
    },
};

const kubernetesApi = {
  proxy: jest.fn(
    ({ clusterName, path }: { clusterName: string; path: string }) => {
      if (clusterName === HUNG) {
        return new Promise<Response>(() => {});
      }
      if (path in responses) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => responses[path],
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);
    },
  ),
  getObjectsByEntity: jest.fn(),
  getClusters: jest.fn(),
  getCluster: jest.fn(),
  getWorkloadsByEntity: jest.fn(),
  getCustomObjectsByEntity: jest.fn(),
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <TestApiProvider
      apis={[
        [kubernetesApiRef, kubernetesApi],
        [mimirApiRef, { query: jest.fn(), queryRange: jest.fn() }],
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

describe('useWorkerCapacity', () => {
  it('shows the capacity of a healthy installation while another hangs', async () => {
    const clusters = [vsphereCluster(HEALTHY), vsphereCluster(HUNG)];

    const { result } = renderHook(() => useWorkerCapacity(clusters), {
      wrapper,
    });

    const key = (installationName: string) =>
      getClusterKey({
        installationName,
        namespace: 'org-test',
        name: 'my-cluster',
      });
    await waitFor(() => {
      expect(result.current.capacities.get(key(HEALTHY))).toEqual({
        isLoading: false,
        capacity: {
          nodes: 2,
          vcpus: 8,
          memoryBytes: 16 * 1024 ** 3,
          uncountedPools: [],
        },
      });
    });
    expect(result.current.capacities.get(key(HUNG))?.isLoading).toBe(true);
  });
});
