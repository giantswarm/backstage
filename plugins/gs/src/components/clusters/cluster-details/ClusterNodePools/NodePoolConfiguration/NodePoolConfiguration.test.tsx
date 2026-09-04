import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import { type KarpenterNodePoolStatus } from '../../../../hooks';
import { NodePoolConfiguration } from './NodePoolConfiguration';

function createPool(spec: Record<string, unknown>): KarpenterMachinePool {
  const json = {
    apiVersion: 'infrastructure.cluster.x-k8s.io/v1alpha1',
    kind: 'KarpenterMachinePool',
    metadata: { name: 'my-pool', namespace: 'org-giantswarm' },
    spec,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new KarpenterMachinePool(json as any, 'test-installation');
}

const fullSpec = {
  nodePool: {
    weight: 10,
    limits: { cpu: '1000' },
    disruption: {
      consolidationPolicy: 'WhenEmptyOrUnderutilized',
      consolidateAfter: '30s',
    },
    template: {
      spec: {
        expireAfter: '720h',
        requirements: [
          {
            key: 'karpenter.sh/capacity-type',
            operator: 'In',
            values: ['spot', 'on-demand'],
          },
          { key: 'kubernetes.io/arch', operator: 'In', values: ['arm64'] },
          {
            key: 'example.com/custom-thing',
            operator: 'In',
            values: ['yes'],
          },
        ],
      },
    },
  },
  ec2NodeClass: {
    amiFamily: 'AL2023',
    amiSelectorTerms: [{ alias: 'al2023@latest' }],
    securityGroupSelectorTerms: [],
    subnetSelectorTerms: [],
  },
};

const status: KarpenterNodePoolStatus = {
  totalNodes: 16,
  capacityTypes: [
    { value: 'spot', count: 14 },
    { value: 'on-demand', count: 2 },
  ],
  architectures: [{ value: 'arm64', count: 16 }],
  instanceFamilies: [{ value: 'c7g', count: 16 }],
  instanceTypes: undefined,
  zones: undefined,
  limits: {},
  usage: {},
  allowedDisruptions: 4,
};

describe('NodePoolConfiguration', () => {
  it('renders the configured requirements from the CR', async () => {
    await renderInTestApp(
      <NodePoolConfiguration
        pool={createPool(fullSpec)}
        nodePoolName="my-pool"
        status={undefined}
      />,
    );

    expect(await screen.findByText('Capacity type')).toBeInTheDocument();
    expect(screen.getByText('Spot')).toBeInTheDocument();
    expect(screen.getByText('On-demand')).toBeInTheDocument();
    expect(screen.getByText('arm64 (Graviton)')).toBeInTheDocument();
  });

  it('renders the four reader-oriented sections', async () => {
    await renderInTestApp(
      <NodePoolConfiguration
        pool={createPool(fullSpec)}
        nodePoolName="my-pool"
        status={undefined}
      />,
    );

    expect(await screen.findByText('Running now')).toBeInTheDocument();
    expect(screen.getByText('Provisioning envelope')).toBeInTheDocument();
    expect(screen.getByText('Lifecycle and disruption')).toBeInTheDocument();
    expect(screen.getByText('Node template')).toBeInTheDocument();
  });

  it('keeps unrecognised requirement keys as their own row', async () => {
    await renderInTestApp(
      <NodePoolConfiguration
        pool={createPool(fullSpec)}
        nodePoolName="my-pool"
        status={undefined}
      />,
    );

    expect(
      await screen.findByText('example.com/custom-thing'),
    ).toBeInTheDocument();
  });

  it('shows the running mix when metrics are available', async () => {
    await renderInTestApp(
      <NodePoolConfiguration
        pool={createPool(fullSpec)}
        nodePoolName="my-pool"
        status={status}
      />,
    );

    expect(
      await screen.findByText('14 spot · 2 on-demand'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 nodes')).toBeInTheDocument();
  });

  it('omits the running lines entirely when metrics are unavailable', async () => {
    await renderInTestApp(
      <NodePoolConfiguration
        pool={createPool(fullSpec)}
        nodePoolName="my-pool"
        status={undefined}
      />,
    );

    expect(await screen.findByText('Capacity type')).toBeInTheDocument();
    expect(screen.queryByText(/14 spot/)).not.toBeInTheDocument();
  });

  it('explains itself when the Karpenter CR could not be read', async () => {
    await renderInTestApp(
      <NodePoolConfiguration
        pool={undefined}
        nodePoolName="my-pool"
        status={undefined}
      />,
    );

    expect(
      await screen.findByText(/Karpenter configuration unavailable/),
    ).toBeInTheDocument();
  });

  it('reports an unconstrained key as "Any" rather than blank', async () => {
    await renderInTestApp(
      <NodePoolConfiguration
        pool={createPool({
          nodePool: { template: { spec: { requirements: [] } } },
        })}
        nodePoolName="my-pool"
        status={undefined}
      />,
    );

    expect(await screen.findByText('Capacity type')).toBeInTheDocument();
    expect(screen.getAllByText('Any').length).toBeGreaterThan(0);
  });
});
