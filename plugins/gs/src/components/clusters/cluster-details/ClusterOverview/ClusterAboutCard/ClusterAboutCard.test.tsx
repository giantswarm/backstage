import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import {
  App,
  Cluster,
  ErrorsProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { clustersRouteRef } from '../../../../../routes';
import { ClusterAboutCard } from './ClusterAboutCard';

const mockUseCurrentCluster = jest.fn();

jest.mock('../../../ClusterDetailsPage/useCurrentCluster', () => ({
  ...jest.requireActual('../../../ClusterDetailsPage/useCurrentCluster'),
  useCurrentCluster: () => mockUseCurrentCluster(),
}));

const INSTALLATION = 'installation-a';

type ControlPlaneRef = NonNullable<ReturnType<Cluster['getControlPlaneRef']>>;

function createCluster(controlPlaneRef?: ControlPlaneRef) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: {
        name: 'my-cluster',
        namespace: 'org-test',
        annotations: { 'cluster.giantswarm.io/description': 'Test cluster' },
      },
      spec: {
        ...(controlPlaneRef && { controlPlaneRef }),
        infrastructureRef: {
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'AzureASOManagedCluster',
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

function createMockKubernetesApi(responses: Record<string, unknown>) {
  return {
    proxy: jest.fn(async ({ path }: ProxyArgs) => {
      if (path in responses) {
        return mockResponse(responses[path]);
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

async function renderCard(api: ReturnType<typeof createMockKubernetesApi>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderInTestApp(
    <TestApiProvider apis={[[kubernetesApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ErrorsProvider>
          <ClusterAboutCard />
        </ErrorsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/clusters': clustersRouteRef } },
  );
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

describe('ClusterAboutCard', () => {
  beforeEach(() => {
    mockUseCurrentCluster.mockReset();
  });

  it('does not fetch a KubeadmControlPlane for a managed control plane', async () => {
    // An AKS cluster references an AzureASOManagedControlPlane. There is no
    // KubeadmControlPlane to read, so the card must neither request it (the
    // GET could only 404) nor discover its API group, and must show no error.
    mockUseCurrentCluster.mockReturnValue({
      installationName: INSTALLATION,
      cluster: createCluster({
        apiGroup: 'infrastructure.cluster.x-k8s.io',
        kind: 'AzureASOManagedControlPlane',
        name: 'my-cluster',
        namespace: 'org-test',
      }),
      clusterApp,
    });
    const api = createMockKubernetesApi({});

    await renderCard(api);

    await waitFor(() => {
      expect(kubernetesVersionField().getByText('n/a')).toBeInTheDocument();
    });

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
        apiGroup: 'controlplane.cluster.x-k8s.io',
        kind: 'KubeadmControlPlane',
        name: 'my-cluster',
        namespace: 'org-test',
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
});
