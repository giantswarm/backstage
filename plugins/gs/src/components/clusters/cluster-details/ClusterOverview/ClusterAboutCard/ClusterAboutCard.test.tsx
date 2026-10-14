import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import {
  App,
  Cluster,
  ErrorsProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { clustersRouteRef } from '../../../../../routes';
import { mimirApiRef } from '../../../../../apis/mimir';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../../../../../apis/installations';
import { ClusterAboutCard } from './ClusterAboutCard';

const mockUseCurrentCluster = jest.fn();

jest.mock('../../../ClusterDetailsPage/useCurrentCluster', () => ({
  ...jest.requireActual('../../../ClusterDetailsPage/useCurrentCluster'),
  useCurrentCluster: () => mockUseCurrentCluster(),
}));

const INSTALLATION = 'installation-a';

type ControlPlaneRef = NonNullable<ReturnType<Cluster['getControlPlaneRef']>>;

function createCluster({
  controlPlaneRef,
  labels,
  infrastructureKind = 'AzureASOManagedCluster',
}: {
  controlPlaneRef?: ControlPlaneRef;
  labels?: Record<string, string>;
  infrastructureKind?: string;
} = {}) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: {
        name: 'my-cluster',
        namespace: 'org-test',
        annotations: { 'cluster.giantswarm.io/description': 'Test cluster' },
        ...(labels && { labels }),
      },
      spec: {
        ...(controlPlaneRef && { controlPlaneRef }),
        infrastructureRef: {
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: infrastructureKind,
          name: 'my-cluster',
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    INSTALLATION,
  );
}

const clusterApp = new App(
  {
    apiVersion: 'application.giantswarm.io/v1alpha1',
    kind: 'App',
    metadata: { name: 'my-cluster', namespace: 'org-test' },
    spec: { name: 'cluster-azure', namespace: 'org-test' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  INSTALLATION,
);

function mockResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

type ProxyArgs = { clusterName: string; path: string };

function createMockKubernetesApi(
  responses: Record<string, unknown>,
  forbidden: string[] = [],
) {
  return {
    proxy: jest.fn(async ({ path }: ProxyArgs) => {
      if (path in responses) {
        return mockResponse(responses[path]);
      }
      if (forbidden.includes(path)) {
        return { ok: false, status: 403, statusText: 'Forbidden' } as Response;
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

function requestedPaths(api: ReturnType<typeof createMockKubernetesApi>) {
  return api.proxy.mock.calls.map(([{ path }]: [ProxyArgs]) => path);
}

const mimirApi = { query: jest.fn(), queryRange: jest.fn() };

const kubernetesAuthProvidersApi = {
  getCredentials: jest.fn(async () => ({ token: 'token' })),
  decorateRequestBodyForAuth: jest.fn(),
};

async function renderCard(api: ReturnType<typeof createMockKubernetesApi>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderInTestApp(
    <TestApiProvider
      apis={[
        [kubernetesApiRef, api],
        [mimirApiRef, mimirApi],
        [kubernetesAuthProvidersApiRef, kubernetesAuthProvidersApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <ErrorsProvider>
          <ClusterAboutCard />
        </ErrorsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/clusters': clustersRouteRef } },
  );
}

// A disabled query shows "n/a" on the first render, before any request could
// be sent or the 100ms debounce of useShowErrors could publish an error. Wait
// past both before checking that neither happened.
async function settle() {
  await act(() => new Promise(resolve => setTimeout(resolve, 200)));
}

function kubernetesVersionField() {
  const label = screen.getByRole('heading', { name: 'Kubernetes version' });
  return within(label.parentElement as HTMLElement);
}

const controlPlaneGroupResponse = {
  name: 'controlplane.cluster.x-k8s.io',
  versions: [
    {
      groupVersion: 'controlplane.cluster.x-k8s.io/v1beta1',
      version: 'v1beta1',
    },
    {
      groupVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
      version: 'v1beta2',
    },
  ],
  preferredVersion: {
    groupVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
    version: 'v1beta2',
  },
};

const controlPlaneResourcesResponse = {
  groupVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
  resources: [
    {
      name: 'kubeadmcontrolplanes',
      singularName: 'kubeadmcontrolplane',
      namespaced: true,
      kind: 'KubeadmControlPlane',
      verbs: ['get', 'list'],
    },
  ],
};

const kubeadmControlPlaneResponse = {
  apiVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
  kind: 'KubeadmControlPlane',
  metadata: { name: 'my-cluster', namespace: 'org-test' },
  spec: { version: 'v1.31.4' },
};

const infrastructureGroupResponse = {
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
};

const infrastructureResourcesResponse = {
  groupVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
  resources: [
    {
      name: 'azureasomanagedcontrolplanes',
      singularName: 'azureasomanagedcontrolplane',
      namespaced: true,
      kind: 'AzureASOManagedControlPlane',
      verbs: ['get', 'list'],
    },
    {
      name: 'azureasomanagedclusters',
      singularName: 'azureasomanagedcluster',
      namespaced: true,
      kind: 'AzureASOManagedCluster',
      verbs: ['get', 'list'],
    },
  ],
};

const azureASOManagedControlPlaneResponse = {
  apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
  kind: 'AzureASOManagedControlPlane',
  metadata: { name: 'my-cluster', namespace: 'org-test' },
  spec: { version: 'v1.32.5' },
};

const azureASOManagedClusterResponse = {
  apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
  kind: 'AzureASOManagedCluster',
  metadata: { name: 'my-cluster', namespace: 'org-test' },
  spec: {
    resources: [
      {
        apiVersion: 'resources.azure.com/v1api20200601',
        kind: 'ResourceGroup',
        metadata: { name: 'my-cluster' },
        spec: { location: 'westeurope' },
      },
    ],
  },
};

describe('ClusterAboutCard', () => {
  beforeEach(() => {
    mockUseCurrentCluster.mockReset();
    mimirApi.query.mockReset();
    setInstallationsConfig([{ name: INSTALLATION }]);
  });

  afterEach(() => __resetInstallationsConfigForTests());

  it('reads an AKS cluster from its CAPZ managed resources', async () => {
    // An AKS cluster references an AzureASOManagedControlPlane and an
    // AzureASOManagedCluster, and its Cluster carries the `cluster-aks` app
    // label. The card reads the version and the location from those, never
    // touches the KubeadmControlPlane API group (that GET could only 404),
    // and shows no error.
    mockUseCurrentCluster.mockReturnValue({
      installationName: INSTALLATION,
      cluster: createCluster({
        controlPlaneRef: {
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'AzureASOManagedControlPlane',
          name: 'my-cluster',
          namespace: 'org-test',
        },
        labels: { app: 'cluster-aks' },
      }),
      clusterApp,
    });
    const api = createMockKubernetesApi({
      '/apis/infrastructure.cluster.x-k8s.io': infrastructureGroupResponse,
      '/apis/infrastructure.cluster.x-k8s.io/v1beta1':
        infrastructureResourcesResponse,
      '/apis/infrastructure.cluster.x-k8s.io/v1beta1/namespaces/org-test/azureasomanagedcontrolplanes/my-cluster/':
        azureASOManagedControlPlaneResponse,
      '/apis/infrastructure.cluster.x-k8s.io/v1beta1/namespaces/org-test/azureasomanagedclusters/my-cluster/':
        azureASOManagedClusterResponse,
    });

    await renderCard(api);

    expect(
      await screen.findByLabelText('Kubernetes version: 1.32.5'),
    ).toBeInTheDocument();
    expect(await screen.findByText('westeurope')).toBeInTheDocument();
    expect(screen.getByTitle('Azure')).toBeInTheDocument();
    await settle();

    expect(requestedPaths(api)).toContain(
      '/apis/infrastructure.cluster.x-k8s.io/v1beta1/namespaces/org-test/azureasomanagedcontrolplanes/my-cluster/',
    );
    expect(
      requestedPaths(api).filter(
        path =>
          path.includes('kubeadmcontrolplanes') ||
          path.includes('/apis/controlplane.cluster.x-k8s.io'),
      ),
    ).toEqual([]);
    expect(
      screen.queryByText(/Errors when trying to fetch/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/KubeadmControlPlane/)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('does not fetch a control plane of a kind it cannot read', async () => {
    // An EKS cluster references an AWSManagedControlPlane, which has no model
    // yet. The card must neither request it (the GET could only 404) nor
    // discover its API group, and must show no error.
    mockUseCurrentCluster.mockReturnValue({
      installationName: INSTALLATION,
      cluster: createCluster({
        controlPlaneRef: {
          apiGroup: 'controlplane.cluster.x-k8s.io',
          kind: 'AWSManagedControlPlane',
          name: 'my-cluster',
          namespace: 'org-test',
        },
      }),
      clusterApp,
    });
    const api = createMockKubernetesApi({});

    await renderCard(api);

    await waitFor(() => {
      expect(kubernetesVersionField().getByText('n/a')).toBeInTheDocument();
    });
    await settle();

    expect(
      requestedPaths(api).filter(
        path =>
          path.includes('controlplanes') ||
          path.includes('/apis/controlplane.cluster.x-k8s.io'),
      ),
    ).toEqual([]);
    expect(
      screen.queryByText(/Errors when trying to fetch/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/KubeadmControlPlane/)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('renders without a control plane reference, the version as not available', async () => {
    // A Cluster still being created, or an imported one, may have no
    // spec.controlPlaneRef yet. Only the Kubernetes version depends on it.
    mockUseCurrentCluster.mockReturnValue({
      installationName: INSTALLATION,
      cluster: createCluster(),
      clusterApp,
    });
    const api = createMockKubernetesApi({});

    await renderCard(api);

    await waitFor(() => {
      expect(kubernetesVersionField().getByText('n/a')).toBeInTheDocument();
    });
    await settle();
    expect(screen.getByText('Test cluster')).toBeInTheDocument();
    expect(
      requestedPaths(api).filter(path =>
        path.includes('/apis/controlplane.cluster.x-k8s.io'),
      ),
    ).toEqual([]);
    expect(
      screen.queryByText(/Errors when trying to fetch/),
    ).not.toBeInTheDocument();
  });

  it('shows the Kubernetes version of a KubeadmControlPlane', async () => {
    mockUseCurrentCluster.mockReturnValue({
      installationName: INSTALLATION,
      cluster: createCluster({
        controlPlaneRef: {
          apiGroup: 'controlplane.cluster.x-k8s.io',
          kind: 'KubeadmControlPlane',
          name: 'my-cluster',
          namespace: 'org-test',
        },
      }),
      clusterApp,
    });
    const api = createMockKubernetesApi({
      '/apis/controlplane.cluster.x-k8s.io': controlPlaneGroupResponse,
      '/apis/controlplane.cluster.x-k8s.io/v1beta2':
        controlPlaneResourcesResponse,
      '/apis/controlplane.cluster.x-k8s.io/v1beta2/namespaces/org-test/kubeadmcontrolplanes/my-cluster/':
        kubeadmControlPlaneResponse,
    });

    await renderCard(api);

    expect(
      await screen.findByLabelText('Kubernetes version: 1.31.4'),
    ).toBeInTheDocument();
    expect(requestedPaths(api)).toContain(
      '/apis/controlplane.cluster.x-k8s.io/v1beta2/namespaces/org-test/kubeadmcontrolplanes/my-cluster/',
    );
  });

  describe('worker capacity', () => {
    const capiGroup = {
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
          {
            name: 'machinepools',
            singularName: 'machinepool',
            namespaced: true,
            kind: 'MachinePool',
            verbs: ['get', 'list'],
          },
        ],
      },
    };

    const infrastructureGroup = {
      '/apis/infrastructure.cluster.x-k8s.io': infrastructureGroupResponse,
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
    };

    // Selected by the cluster's label, as the Node pools tab lists them, so
    // the two share one query.
    const machineDeploymentsPath = `/apis/cluster.x-k8s.io/v1beta2/namespaces/org-test/machinedeployments/?${new URLSearchParams(
      { labelSelector: 'cluster.x-k8s.io/cluster-name=my-cluster' },
    )}`;
    const vsphereTemplatesPath =
      '/apis/infrastructure.cluster.x-k8s.io/v1beta1/namespaces/org-test/vspheremachinetemplates/';

    const workerDeployment = {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'MachineDeployment',
      metadata: {
        name: 'my-cluster-worker',
        namespace: 'org-test',
        labels: { 'cluster.x-k8s.io/cluster-name': 'my-cluster' },
      },
      spec: {
        replicas: 4,
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
      status: { readyReplicas: 4 },
    };

    const workerTemplate = {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
      kind: 'VSphereMachineTemplate',
      metadata: { name: 'my-cluster-worker-abc', namespace: 'org-test' },
      spec: {
        template: {
          spec: {
            template: 'flatcar',
            numCPUs: 8,
            memoryMiB: 32768,
            network: { devices: [] },
          },
        },
      },
    };

    function workerCapacityField() {
      const label = screen.getByRole('heading', { name: 'Worker capacity' });
      return within(label.parentElement as HTMLElement);
    }

    it('multiplies the ready nodes of a vSphere cluster by their template size', async () => {
      mockUseCurrentCluster.mockReturnValue({
        installationName: INSTALLATION,
        cluster: createCluster({ infrastructureKind: 'VSphereCluster' }),
        clusterApp,
      });
      const api = createMockKubernetesApi({
        ...capiGroup,
        ...infrastructureGroup,
        [machineDeploymentsPath]: { items: [workerDeployment] },
        [vsphereTemplatesPath]: { items: [workerTemplate] },
      });

      await renderCard(api);

      await waitFor(() => {
        expect(
          workerCapacityField()
            .getByText(/4 nodes/)
            .closest('p')?.textContent,
        ).toMatch(/^4 nodes\s+·\s+32 vCPUs\s+·\s+128 GiB RAM$/);
      });
      expect(
        workerCapacityField().getByText('128 GiB RAM'),
      ).toBeInTheDocument();
      expect(mimirApi.query).not.toHaveBeenCalled();
    });

    it('names the pools it cannot count when node metrics are unavailable', async () => {
      // No template size and no Mimir: the nodes count, their CPU and
      // memory do not, and the hint says which pool and why.
      setInstallationsConfig([{ name: INSTALLATION, mimirEnabled: false }]);
      mockUseCurrentCluster.mockReturnValue({
        installationName: INSTALLATION,
        cluster: createCluster({ infrastructureKind: 'VCDCluster' }),
        clusterApp,
      });
      const api = createMockKubernetesApi({
        ...capiGroup,
        [machineDeploymentsPath]: {
          items: [
            {
              ...workerDeployment,
              spec: {
                ...workerDeployment.spec,
                template: {
                  spec: {
                    infrastructureRef: {
                      apiGroup: 'infrastructure.cluster.x-k8s.io',
                      kind: 'VCDMachineTemplate',
                      name: 'my-cluster-worker-abc',
                    },
                  },
                },
              },
            },
          ],
        },
      });

      await renderCard(api);

      // The only pool is uncounted: the node count stands alone rather than
      // beside 0 vCPUs and 0 MiB.
      expect(
        await workerCapacityField().findByRole('button', {
          name: 'Why CPU and memory are unknown',
        }),
      ).toBeInTheDocument();
      expect(
        workerCapacityField().getByText('(CPU and memory unknown)'),
      ).toBeInTheDocument();
      expect(workerCapacityField().getByText('4 nodes')).toBeInTheDocument();
      expect(workerCapacityField().queryByText(/vCPU/)).not.toBeInTheDocument();
      expect(mimirApi.query).not.toHaveBeenCalled();
    });

    it('counts a pool without a machine size from node metrics', async () => {
      mimirApi.query.mockResolvedValue({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            {
              metric: {
                cluster_id: 'my-cluster',
                nodepool: 'my-cluster-worker',
                resource: 'nodes',
              },
              value: [0, '3'],
            },
            {
              metric: {
                cluster_id: 'my-cluster',
                nodepool: 'my-cluster-worker',
                resource: 'cpu',
              },
              value: [0, '12'],
            },
            {
              metric: {
                cluster_id: 'my-cluster',
                nodepool: 'my-cluster-worker',
                resource: 'memory',
              },
              value: [0, String(48 * 1024 ** 3)],
            },
          ],
        },
      });
      mockUseCurrentCluster.mockReturnValue({
        installationName: INSTALLATION,
        cluster: createCluster({ infrastructureKind: 'VCDCluster' }),
        clusterApp,
      });
      const api = createMockKubernetesApi({
        ...capiGroup,
        [machineDeploymentsPath]: {
          items: [
            {
              ...workerDeployment,
              spec: {
                ...workerDeployment.spec,
                template: {
                  spec: {
                    infrastructureRef: {
                      apiGroup: 'infrastructure.cluster.x-k8s.io',
                      kind: 'VCDMachineTemplate',
                      name: 'my-cluster-worker-abc',
                    },
                  },
                },
              },
            },
          ],
        },
      });
      api.getCluster.mockResolvedValue({ authProvider: 'oidc' });

      await renderCard(api);

      await waitFor(() => {
        expect(
          workerCapacityField()
            .getByText(/3 nodes/)
            .closest('p')?.textContent,
        ).toMatch(/^3 nodes\s+·\s+12 vCPUs\s+·\s+48 GiB RAM$/);
      });
      expect(workerCapacityField().getByText('48 GiB RAM')).toBeInTheDocument();
      expect(mimirApi.query).toHaveBeenCalledWith(
        expect.objectContaining({
          installationName: INSTALLATION,
          query: expect.stringContaining('cluster_id=~"my-cluster"'),
        }),
      );
    });

    it('shows why the node pools could not be read', async () => {
      mockUseCurrentCluster.mockReturnValue({
        installationName: INSTALLATION,
        cluster: createCluster({ infrastructureKind: 'VSphereCluster' }),
        clusterApp,
      });
      const api = createMockKubernetesApi(
        {
          ...capiGroup,
          ...infrastructureGroup,
          [machineDeploymentsPath]: { items: [workerDeployment] },
        },
        [vsphereTemplatesPath],
      );

      await renderCard(api);

      expect(
        await workerCapacityField().findByTitle(
          'Could not read the node pools: Access forbidden.',
        ),
      ).toBeInTheDocument();
    });
  });
});
