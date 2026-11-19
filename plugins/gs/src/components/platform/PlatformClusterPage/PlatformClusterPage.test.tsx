import { Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { App, Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import type { ClusterReadState } from '../../clusters/ClusterDetailsPage/useClusterFromUrl';
import { type PlatformLinks, PlatformLinksProvider } from '../PlatformLinks';
import { PlatformClusterRoute } from './PlatformClusterPage';

let mockInstallations: {
  clusters: string[];
  isLoading: boolean;
  error: Error | null;
};
let mockDisabled: string[];
let mockState: ClusterReadState;
let mockBaseDomain: string | undefined;
let mockInGit: boolean;
let mockStaff: boolean | undefined;
let mockNewer: { version: string; date?: string } | undefined;

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useClustersInfo: () => ({ ...mockInstallations, retry: jest.fn() }),
}));
const mockDisabledListeners = new Set<() => void>();
/** Changes what the readiness check reports, re-rendering its readers. */
function setMockDisabled(installations: string[]) {
  mockDisabled = installations;
  mockDisabledListeners.forEach(listener => listener());
}
jest.mock('../../hooks/useDisabledInstallations', () => ({
  useDisabledInstallations: () => ({
    disabledInstallations: jest.requireActual('react').useSyncExternalStore(
      (listener: () => void) => {
        mockDisabledListeners.add(listener);
        return () => mockDisabledListeners.delete(listener);
      },
      () => mockDisabled,
    ),
    isLoading: false,
  }),
}));
jest.mock('../../clusters/ClusterDetailsPage/useClusterFromUrl', () => ({
  ...jest.requireActual('../../clusters/ClusterDetailsPage/useClusterFromUrl'),
  useCluster: () => mockState,
}));
jest.mock('../../clusters/ClusterDetailsPage/useClusterControlPlane', () => ({
  useClusterControlPlane: () => ({
    isLoading: false,
    version: 'v1.31.7',
    replicas: 3,
  }),
}));
jest.mock('../../clusters/ClusterDetailsPage/useNewerRelease', () => ({
  useNewerRelease: () => mockNewer,
}));
jest.mock(
  '../../clusters/cluster-details/ClusterOverview/ClusterAboutCard/AWSAccountField',
  () => ({
    useAWSAccount: () => ({
      isLoading: false,
      accountId: '123456789012',
      accountUrl: 'https://console.aws.amazon.com/?account=123456789012',
    }),
  }),
);
jest.mock(
  '../../clusters/cluster-details/ClusterOverview/ClusterAboutCard/ProviderClusterLocation',
  () => ({ ProviderClusterLocation: () => 'eu-central-1' }),
);
jest.mock(
  '../../clusters/cluster-details/ClusterOverview/ClusterToolsCard',
  () => ({
    useClusterToolLinks: () => ({
      isLoading: false,
      links: [
        {
          label: 'Cluster overview \n dashboard',
          icon: 'GrafanaIcon',
          url: 'https://grafana.example.com/d/cluster',
        },
      ],
    }),
  }),
);
jest.mock('../../hooks/useWorkerCapacity', () => ({
  getClusterKey: ({
    installationName,
    namespace,
    name,
  }: {
    installationName: string;
    namespace?: string;
    name: string;
  }) => `${installationName}/${namespace}/${name}`,
  useWorkerCapacity: () => ({
    capacities: new Map([
      [
        'meadow/org-fern/alder-birch',
        {
          isLoading: false,
          capacity: {
            nodes: 12,
            vcpus: 48,
            memoryBytes: 192 * 1024 ** 3,
            uncountedPools: [],
          },
        },
      ],
    ]),
  }),
}));
jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useNodePoolsForAWSCluster: () => ({
    machinePools: [],
    awsMachinePools: [],
    karpenterMachinePools: [],
    isLoading: false,
    errors: [],
  }),
  useNodePoolsForAzureCluster: () => ({
    machineDeployments: [],
    azureMachineTemplates: [],
    isLoading: false,
    errors: [],
  }),
  useMachineTypeCatalog: () => ({ catalog: undefined, isLoading: false }),
  useCurrentUser: () => ({ isLoading: false, isGSUser: mockStaff }),
  useFriendlyItemsConfiguration: () => undefined,
  useInstallationsInfo: () => ({
    installationsInfo: [{ name: 'meadow', baseDomain: mockBaseDomain }],
    isLoading: false,
  }),
}));
jest.mock('../../hooks/useK8sVersionEOLDate', () => ({
  useK8sVersionEOLDate: () => '2027-03-28',
}));
jest.mock('@giantswarm/backstage-plugin-flux-react', () => {
  const k8s = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  return {
    ...jest.requireActual('@giantswarm/backstage-plugin-flux-react'),
    useGitOpsSource: () => ({
      inGit: mockInGit,
      isLoading: false,
      url: 'https://github.com/example/fern-gitops/tree/main/clusters',
      kustomization: { name: 'fern-gitops', namespace: 'flux-giantswarm' },
      errors: [],
      // What the lookup read: the last apply and the branch come from these.
      resources: {
        kustomization: new k8s.Kustomization(
          {
            apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
            kind: 'Kustomization',
            metadata: { name: 'fern-gitops', namespace: 'flux-giantswarm' },
            spec: { sourceRef: { kind: 'GitRepository', name: 'fern-gitops' } },
            status: {
              lastAppliedRevision: 'main@sha1:3f9a2c1d8e0b6a4f1c2d3e4f',
              conditions: [
                {
                  type: 'Ready',
                  status: 'True',
                  lastTransitionTime: '2026-11-17T08:00:00Z',
                },
              ],
            },
          },
          'meadow',
        ),
        gitRepository: new k8s.GitRepository(
          {
            apiVersion: 'source.toolkit.fluxcd.io/v1',
            kind: 'GitRepository',
            metadata: { name: 'fern-gitops', namespace: 'flux-giantswarm' },
            spec: {
              url: 'https://github.com/example/fern-gitops',
              ref: { branch: 'main' },
            },
          },
          'meadow',
        ),
      },
    }),
  };
});

const LINKS: PlatformLinks = {
  platform: '/platform',
  clusters: '/platform/clusters',
  cluster: ({ installationName, namespace, name }) =>
    `/platform/clusters/${installationName}/${namespace}/${name}`,
};

function clusterOf(
  name: string,
  namespace: string,
  {
    management = false,
    deleting = false,
  }: { management?: boolean; deleting?: boolean } = {},
): Cluster {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: {
        name,
        namespace,
        creationTimestamp: '2024-01-12T00:00:00Z',
        ...(deleting && { deletionTimestamp: '2026-11-17T08:00:00Z' }),
        labels: {
          'cluster.x-k8s.io/cluster-name': name,
          app: 'cluster-aws',
          'app.kubernetes.io/version': '3.4.1',
          'release.giantswarm.io/version': '31.1.0',
          'giantswarm.io/organization': management ? 'giantswarm' : 'fern',
          'giantswarm.io/service-priority': 'highest',
        },
        annotations: {
          'cluster.giantswarm.io/description': 'Fern production',
        },
      },
      spec: {
        controlPlaneEndpoint: {
          host: `api.${name}.meadow.example.com`,
          port: 443,
        },
        infrastructureRef: {
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'AWSCluster',
          name,
        },
      },
      status: {
        conditions: [{ type: 'ControlPlaneInitialized', status: 'True' }],
      },
    } as any,
    'meadow',
  );
}

function appOf(
  name: string,
  namespace: string,
  {
    deleting = false,
    release = { status: 'deployed' },
  }: { deleting?: boolean; release?: { status: string; reason?: string } } = {},
): App {
  return new App(
    {
      apiVersion: 'application.giantswarm.io/v1alpha1',
      kind: 'App',
      metadata: {
        name,
        namespace,
        ...(deleting && { deletionTimestamp: '2026-11-17T08:00:00Z' }),
        labels: {
          'kustomize.toolkit.fluxcd.io/name': 'fern-gitops',
          'kustomize.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
        },
      },
      spec: { name: 'cluster-aws', namespace, version: '3.4.1' },
      status: { release },
    } as any,
    'meadow',
  );
}

function stateOf(state: Partial<ClusterReadState>): ClusterReadState {
  return {
    installationName: 'meadow',
    isDeleting: false,
    loading: false,
    notFound: false,
    error: null,
    refreshError: null,
    ...state,
  };
}

function Path() {
  return <output aria-label="path">{useLocation().pathname}</output>;
}

let queryClient: QueryClient;

function renderPage(path = '/platform/clusters/meadow/org-fern/alder-birch') {
  return renderInTestApp(
    // The Platform page's query client, which the page reads through.
    <QueryClientProvider client={queryClient}>
      <PageHeaderActionsProvider>
        <PlatformLinksProvider links={LINKS}>
          <Routes>
            <Route
              path="/platform/clusters/:installationName/:namespace/:name/*"
              element={<PlatformClusterRoute />}
            />
          </Routes>
          <Path />
        </PlatformLinksProvider>
      </PageHeaderActionsProvider>
    </QueryClientProvider>,
    { initialRouteEntries: [path] },
  );
}

const workload = clusterOf('alder-birch', 'org-fern');

describe('PlatformClusterPage', () => {
  beforeEach(() => {
    queryClient = new QueryClient();
    mockInstallations = { clusters: ['meadow'], isLoading: false, error: null };
    mockDisabled = [];
    mockBaseDomain = 'meadow.example.com';
    mockInGit = true;
    mockStaff = false;
    mockNewer = { version: '31.2.0', date: '2026-09-18T00:00:00Z' };
    mockState = stateOf({
      cluster: workload,
      clusterApp: appOf('alder-birch', 'org-fern'),
    });
  });

  it('shows a workload cluster with its state, facts and Overview', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'alder-birch' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(
      screen.getByText('Workload cluster of the fern organization in meadow.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute(
      'href',
      '/platform/clusters',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.dataset.key)).toEqual([
      'overview',
      'node-pools',
    ]);

    const facts = screen.getByRole('complementary', { name: 'Details' });
    // A workload cluster's environment leads to its management cluster.
    expect(within(facts).getByRole('link', { name: 'meadow' })).toHaveAttribute(
      'href',
      '/platform/clusters/meadow/org-giantswarm/meadow',
    );
    expect(facts.textContent).toContain('fern');
    // The provider and its region in one fact.
    expect(facts.textContent).toContain('AWS · eu-central-1');
    // The account in groups of four, linked to the AWS console.
    expect(
      within(facts).getByRole('link', { name: /1234 5678 9012/ }),
    ).toHaveAttribute(
      'href',
      'https://console.aws.amazon.com/?account=123456789012',
    );
    expect(facts.textContent).toContain('12 Jan 2024');
    // The tools as tiles, above the facts.
    const tools = screen.getByRole('group', { name: 'Tools' });
    expect(
      within(tools).getByRole('link', { name: /Cluster overview dashboard/ }),
    ).toHaveAttribute('href', 'https://grafana.example.com/d/cluster');

    const release = screen.getByRole('region', { name: 'Release' });
    expect(release.textContent).toContain('31.1.0');
    expect(
      within(release).getByRole('link', { name: /Release notes/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/releases/releases/tag/aws/v31.1.0',
    );
    expect(release.textContent).toContain(
      '1.31.7 · supported until 28 Mar 2027',
    );
    expect(release.textContent).toContain('31.2.0, released 18 Sep');

    const labels = screen.getByRole('region', {
      name: 'Labels and annotations',
    });
    expect(labels.textContent).toContain('Fern production');
    expect(labels.textContent).toContain('Service priority');

    const gitOps = screen.getByRole('region', { name: 'GitOps delivery' });
    expect(gitOps.textContent).toContain('Kustomization fern-gitops');
    expect(gitOps.textContent).toContain('Applied');
    expect(gitOps.textContent).toContain('3f9a2c1');
    expect(
      within(gitOps).getByRole('link', { name: /example\/fern-gitops/ }),
    ).toBeInTheDocument();
    expect(gitOps.textContent).toContain(', branch main');
    expect(gitOps.textContent).toContain(
      'Changes to this cluster go through this repository.',
    );

    const login = screen.getByRole('region', { name: 'Work with the cluster' });
    expect(login.textContent).toContain(
      'kubectl gs login api.meadow.example.com',
    );
    expect(login.textContent).toContain('--workload-cluster alder-birch');
    // Not staff: no Teleport command.
    expect(login.textContent).not.toContain('tsh kube login');

    await userEvent.click(
      screen.getByRole('button', { name: /Technical details/ }),
    );
    expect(screen.getByText('3 replicas, initialized')).toBeInTheDocument();
    expect(
      screen.getByText('api.alder-birch.meadow.example.com'),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Labels' })).toBeInTheDocument();
    // Its headings at the fact labels' size, 14px.
    for (const heading of ['Labels', 'Annotations']) {
      expect(screen.getByText(heading, { selector: 'p' })).toHaveAttribute(
        'data-variant',
        'body-medium',
      );
    }
  });

  it('shows Giant Swarm staff the Teleport command after kubectl gs', async () => {
    mockStaff = true;
    await renderPage();

    const login = screen.getByRole('region', { name: 'Work with the cluster' });
    const text = login.textContent ?? '';
    expect(text).toContain('Teleport, for Giant Swarm staff');
    // The captions at the body size, 14px.
    for (const caption of ['kubectl gs', 'Teleport, for Giant Swarm staff']) {
      expect(within(login).getByText(caption)).toHaveAttribute(
        'data-variant',
        'body-medium',
      );
    }
    expect(text.indexOf('kubectl gs login')).toBeLessThan(
      text.indexOf('tsh kube login meadow-alder-birch'),
    );
  });

  it('keeps a cluster on the page when its environment stops answering', async () => {
    await renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: /Technical details/ }),
    );

    act(() => setMockDisabled(['meadow']));

    // Still the page, its fold-out still open, with a warning.
    expect(screen.getByText('3 replicas, initialized')).toBeInTheDocument();
    expect(
      screen.getByText('Could not reach meadow just now'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Could not reach meadow'),
    ).not.toBeInTheDocument();
  });

  it('re-reads by itself while only the installer is there', async () => {
    jest.useFakeTimers();
    try {
      mockState = stateOf({
        clusterApp: appOf('alder-birch', 'org-fern', {
          release: { status: 'pending-install' },
        }),
        error: Object.assign(new Error('not found'), { name: 'NotFoundError' }),
      });
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      await renderPage();
      expect(
        screen.getByText('alder-birch is being created'),
      ).toBeInTheDocument();
      invalidate.mockClear();

      jest.advanceTimersByTime(10_000);
      expect(invalidate).toHaveBeenCalledTimes(1);
      const [{ predicate }] = invalidate.mock.calls[0] as any;
      expect(predicate({ queryKey: ['cluster', 'meadow', 'get'] })).toBe(true);
      expect(
        predicate({ queryKey: ['cluster', 'meadow', 'api-discovery'] }),
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('copies the login command from the menu', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(window.navigator, { clipboard: { writeText } });
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Copy login command' }),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('kubectl gs login api.meadow.example.com'),
    );
  });

  it('describes a management cluster and leaves its environment unlinked', async () => {
    mockState = stateOf({
      cluster: clusterOf('meadow', 'org-giantswarm', { management: true }),
      clusterApp: appOf('meadow', 'org-giantswarm'),
    });
    await renderPage('/platform/clusters/meadow/org-giantswarm/meadow');

    expect(
      screen.getByText('Management cluster of the meadow environment.'),
    ).toBeInTheDocument();
    const facts = screen.getByRole('complementary', { name: 'Details' });
    expect(
      within(facts).queryByRole('link', { name: 'meadow' }),
    ).not.toBeInTheDocument();
  });

  it('leaves out what the cluster does not have', async () => {
    mockBaseDomain = undefined;
    mockInGit = false;
    await renderPage();

    expect(
      screen.queryByRole('region', { name: 'GitOps delivery' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Work with the cluster' }),
    ).not.toBeInTheDocument();
  });

  it('says a cluster is being deleted', async () => {
    mockState = stateOf({
      cluster: clusterOf('alder-birch', 'org-fern', { deleting: true }),
      isDeleting: true,
    });
    await renderPage();

    expect(screen.getByText('Deleting')).toBeInTheDocument();
    expect(
      screen.getByText('alder-birch is being deleted'),
    ).toBeInTheDocument();
  });

  it('reads in the final geometry while the cluster loads', async () => {
    mockState = stateOf({ loading: true });
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Reading alder-birch…' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });

  it('says when the environment has no such cluster', async () => {
    mockState = stateOf({ notFound: true });
    await renderPage();

    expect(
      screen.getByText('No cluster alder-birch in meadow'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to clusters' }),
    ).toHaveAttribute('href', '/platform/clusters');
  });

  it('says when the portal knows no such environment', async () => {
    await renderPage('/platform/clusters/nowhere/org-fern/alder-birch');

    expect(screen.getByText('No environment nowhere')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to clusters' }),
    ).toBeInTheDocument();
  });

  it('says when the environment cannot be reached, with Try again', async () => {
    mockDisabled = ['meadow'];
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reach meadow',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['installations', 'status'],
    });
  });

  it('says why the cluster could not be read, with Try again', async () => {
    mockState = stateOf({ error: new Error('the API answered 503') });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not read alder-birch',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('the API answered 503');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const [{ predicate }] = invalidate.mock.calls[0] as any;
    expect(predicate({ queryKey: ['cluster', 'meadow', 'get'] })).toBe(true);
    expect(predicate({ queryKey: ['cluster', 'fennel', 'get'] })).toBe(false);
  });

  it('says the read failed, not that the cluster is being created, when its App is there', async () => {
    mockState = stateOf({
      clusterApp: appOf('alder-birch', 'org-fern'),
      error: Object.assign(new Error('Access forbidden'), {
        name: 'ForbiddenError',
      }),
    });
    await renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not read alder-birch',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Access forbidden');
    expect(screen.queryByText(/being created/)).not.toBeInTheDocument();
  });

  const gone = () =>
    Object.assign(new Error('not found'), { name: 'NotFoundError' });

  it('shows the App’s status while the cluster is being created', async () => {
    mockState = stateOf({
      clusterApp: appOf('alder-birch', 'org-fern', {
        release: { status: 'pending-install' },
      }),
      error: gone(),
    });
    await renderPage();

    expect(
      screen.getByText('alder-birch is being created'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pending install')).toBeInTheDocument();
  });

  it('shows a failed App as failed, with its reason', async () => {
    mockState = stateOf({
      clusterApp: appOf('alder-birch', 'org-fern', {
        release: { status: 'failed', reason: 'values do not match the schema' },
      }),
      error: gone(),
    });
    await renderPage();

    expect(
      screen.getByText('alder-birch could not be installed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('values do not match the schema'),
    ).toBeInTheDocument();
  });

  it('keeps saying the cluster is being deleted once its Cluster has gone before its App', async () => {
    mockState = stateOf({
      clusterApp: appOf('alder-birch', 'org-fern', { deleting: true }),
      error: gone(),
    });
    await renderPage();

    expect(
      screen.getByText('alder-birch is being deleted'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/being created/)).not.toBeInTheDocument();
  });

  it('opens Overview for a tab the page does not have', async () => {
    await renderPage('/platform/clusters/meadow/org-fern/alder-birch/apps');

    expect(screen.getByRole('status', { name: 'path' })).toHaveTextContent(
      '/platform/clusters/meadow/org-fern/alder-birch',
    );
    expect(screen.getByRole('region', { name: 'Release' })).toBeInTheDocument();
  });
});
