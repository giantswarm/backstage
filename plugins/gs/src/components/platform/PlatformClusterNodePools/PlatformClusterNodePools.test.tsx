import { useLocation } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  AWSMachinePool,
  Cluster,
  KarpenterMachinePool,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import type { NodePoolNode } from '../../hooks';
import { PlatformClusterNodePools } from './PlatformClusterNodePools';

const NAMESPACE = 'org-fern';
let mockInfrastructureKind: string;

function machinePool(name: string, kind: string) {
  return new MachinePool(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'MachinePool',
      metadata: { name, namespace: NAMESPACE },
      spec: {
        clusterName: 'alder',
        replicas: 3,
        template: {
          spec: {
            clusterName: 'alder',
            infrastructureRef: { kind, name },
          },
        },
      },
      status: { phase: 'Running', readyReplicas: 3 },
    } as any,
    'meadow',
  );
}

const mockPools = {
  machinePools: [
    machinePool('alder-general', 'AWSMachinePool'),
    machinePool('alder-spot', 'KarpenterMachinePool'),
  ],
  awsMachinePools: [
    new AWSMachinePool(
      {
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
        kind: 'AWSMachinePool',
        metadata: { name: 'alder-general', namespace: NAMESPACE },
        spec: {
          minSize: 3,
          maxSize: 10,
          awsLaunchTemplate: { instanceType: 'm6i.xlarge' },
        },
      } as any,
      'meadow',
    ),
  ],
  karpenterMachinePools: [
    new KarpenterMachinePool(
      {
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1alpha1',
        kind: 'KarpenterMachinePool',
        metadata: { name: 'alder-spot', namespace: NAMESPACE },
        spec: { nodePool: { template: { spec: { requirements: [] } } } },
      } as any,
      'meadow',
    ),
  ],
  isLoading: false,
  errors: [],
};

const NODE: NodePoolNode = {
  id: 'ip-10-0-41-12.eu-central-1.compute.internal',
  node: 'ip-10-0-41-12.eu-central-1.compute.internal',
  instanceType: 'm6i.xlarge',
  zone: 'eu-central-1a',
  ready: false,
  conditions: ['MemoryPressure'],
  cpuAllocatable: 3.92,
  cpuRequests: 2.3,
  memoryAllocatable: 14.8 * 1024 ** 3,
  memoryRequests: 9.1 * 1024 ** 3,
  podsAllocatable: 58,
  runningPods: 31,
  created: new Date('2026-11-16T00:00:00Z'),
};

jest.mock('../../clusters/ClusterDetailsPage/useCurrentCluster', () => ({
  useCurrentCluster: () => ({
    installationName: 'meadow',
    cluster: new Cluster(
      {
        apiVersion: 'cluster.x-k8s.io/v1beta2',
        kind: 'Cluster',
        metadata: { name: 'alder', namespace: 'org-fern' },
        spec: {
          infrastructureRef: { kind: mockInfrastructureKind, name: 'alder' },
        },
      } as any,
      'meadow',
    ),
  }),
}));

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useNodePoolsForAWSCluster: () => mockPools,
  useNodePoolsForAzureCluster: () => ({
    machineDeployments: [],
    azureMachineTemplates: [],
    isLoading: false,
    errors: [],
  }),
  useMachineTypeCatalog: () => ({ catalog: undefined, isLoading: false }),
  useMimirNodePoolNodes: () => ({
    nodes: [NODE],
    isLoading: false,
    error: null,
  }),
  useKarpenterNodePoolStatus: () => ({
    status: undefined,
    isLoading: false,
    error: null,
    isAvailable: true,
  }),
}));

function Search() {
  return (
    <div role="status" aria-label="search">
      {useLocation().search}
    </div>
  );
}

function renderTab(search = '') {
  return renderInTestApp(
    <>
      <PlatformClusterNodePools />
      <Search />
    </>,
    { initialRouteEntries: [`/node-pools${search}`] },
  );
}

describe('PlatformClusterNodePools', () => {
  beforeEach(() => {
    mockInfrastructureKind = 'AWSCluster';
  });

  it('lists the pools and asks for a selection', async () => {
    await renderTab();
    expect(
      screen.getByRole('button', { name: 'alder-general', pressed: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('Karpenter')).toBeInTheDocument();
    expect(
      screen.getByText('Select a node pool to see its nodes and details.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nodes in/)).not.toBeInTheDocument();
  });

  it('selects a pool into the URL and shows its nodes and details', async () => {
    await renderTab();
    await userEvent.click(
      screen.getByRole('button', { name: 'alder-general' }),
    );

    expect(screen.getByRole('status', { name: 'search' })).toHaveTextContent(
      '?name=alder-general',
    );
    expect(
      screen.getByRole('button', { name: 'alder-general', pressed: true }),
    ).toBeInTheDocument();
    const nodes = screen.getByRole('region', {
      name: 'Nodes in alder-general',
    });
    expect(within(nodes).getByText('ip-10-0-41-12')).toHaveAttribute(
      'title',
      NODE.node,
    );
    // The bar's value beside it, the whole figure as hover text.
    expect(
      within(nodes).getByTitle('Requests: 2.3 of 3.92 CPU allocatable (59%)'),
    ).toHaveTextContent('2.3');
    expect(
      within(nodes).getByTitle(
        'Requests: 9.1 GiB of 14.8 GiB allocatable (61%)',
      ),
    ).toBeInTheDocument();
    expect(
      within(nodes).getByTitle('Running: 31 of 58 allocatable (53%)'),
    ).toBeInTheDocument();
    // Not ready: the conditions as hover text.
    expect(
      within(nodes).getByTitle('Not ready: MemoryPressure'),
    ).toHaveTextContent('No');
    expect(
      screen.getByRole('button', {
        name: 'Technical details of alder-general',
      }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Instance shape')).toBeInTheDocument();
  });

  it('shows a Karpenter pool from a shared link, without a node table', async () => {
    await renderTab('?name=alder-spot');
    expect(
      screen.getByRole('button', { name: 'alder-spot', pressed: true }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nodes in/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Technical details of alder-spot' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Provisioning envelope')).toBeInTheDocument();
  });

  it('selects nothing for a pool the cluster does not have', async () => {
    await renderTab('?name=gone');
    expect(
      screen.getByText('Select a node pool to see its nodes and details.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { pressed: true }),
    ).not.toBeInTheDocument();
  });

  it('says other providers are not shown yet', async () => {
    mockInfrastructureKind = 'VSphereCluster';
    await renderTab();
    expect(
      screen.getByText("Node pools of vSphere clusters aren't shown here yet."),
    ).toBeInTheDocument();
  });
});
