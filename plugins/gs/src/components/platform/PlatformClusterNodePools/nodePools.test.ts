import {
  AWSMachinePool,
  KarpenterMachinePool,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  awsNodePools,
  azureNodePools,
  formatNodesReady,
  formatZones,
  isShortOfNodes,
} from './nodePools';

const INSTALLATION = 'meadow';
const NAMESPACE = 'org-fern';

function machinePool(name: string, kind: string, ready = 6, desired = 6) {
  return new MachinePool(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'MachinePool',
      metadata: {
        name,
        namespace: NAMESPACE,
        creationTimestamp: '2024-01-12T10:00:00Z',
      },
      spec: {
        clusterName: 'alder',
        replicas: desired,
        template: {
          spec: {
            clusterName: 'alder',
            infrastructureRef: {
              apiGroup: 'infrastructure.cluster.x-k8s.io',
              kind,
              name,
            },
          },
        },
      },
      status: { phase: 'Running', readyReplicas: ready },
    } as any,
    INSTALLATION,
  );
}

const awsMachinePool = new AWSMachinePool(
  {
    apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
    kind: 'AWSMachinePool',
    metadata: { name: 'alder-general', namespace: NAMESPACE },
    spec: {
      minSize: 3,
      maxSize: 10,
      availabilityZones: ['eu-central-1a', 'eu-central-1b', 'eu-central-1c'],
      awsLaunchTemplate: { instanceType: 'm6i.xlarge' },
    },
  } as any,
  INSTALLATION,
);

function karpenterPool(requirements: object[], limits?: object) {
  return new KarpenterMachinePool(
    {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1alpha1',
      kind: 'KarpenterMachinePool',
      metadata: { name: 'alder-spot', namespace: NAMESPACE },
      spec: {
        nodePool: {
          template: { spec: { requirements } },
          ...(limits && { limits }),
        },
      },
    } as any,
    INSTALLATION,
  );
}

const CAPACITY = {
  key: 'karpenter.sh/capacity-type',
  operator: 'In',
  values: ['spot', 'on-demand'],
};

describe('awsNodePools', () => {
  it('reads an Auto Scaling group pool as a machine pool', () => {
    const [pool] = awsNodePools(
      [machinePool('alder-general', 'AWSMachinePool')],
      [awsMachinePool],
      [],
      () => ({ size: { vcpus: 4, memoryBytes: 16 * 1024 ** 3 } }),
    );
    expect(pool).toMatchObject({
      name: 'alder-general',
      kind: 'machinePool',
      machine: 'm6i.xlarge',
      machineDetail: '4 CPU · 16 GiB',
      scaling: 'Between 3 and 10 nodes',
    });
    expect(formatZones(pool.zones)).toBe('A, B, C');
    expect(formatNodesReady(pool)).toBe('6 of 6');
  });

  it('reads a Karpenter pool from its requirements and limits', () => {
    const [pool] = awsNodePools(
      [machinePool('alder-spot', 'KarpenterMachinePool')],
      [],
      [karpenterPool([CAPACITY], { cpu: 48, memory: '192Gi' })],
      undefined,
    );
    expect(pool).toMatchObject({
      kind: 'karpenter',
      machine: 'Mixed',
      machineDetail: 'Spot and on-demand',
      zones: 'any',
      scaling: 'As needed, up to 48 CPU · 192 GiB',
    });
    expect(formatZones(pool.zones)).toBe('Any');
    expect(formatNodesReady(pool)).toBe('6 ready');
  });

  it('names a single instance type, the zones required, and no limit', () => {
    const [pool] = awsNodePools(
      [machinePool('alder-spot', 'KarpenterMachinePool')],
      [],
      [
        karpenterPool([
          {
            key: 'node.kubernetes.io/instance-type',
            operator: 'In',
            values: ['c5a.xlarge'],
          },
          {
            key: 'topology.kubernetes.io/zone',
            operator: 'In',
            values: ['eu-central-1a', 'eu-central-1b'],
          },
        ]),
      ],
      undefined,
    );
    expect(pool.machine).toBe('c5a.xlarge');
    expect(formatZones(pool.zones)).toBe('A, B');
    expect(pool.scaling).toBe('As needed, no limit');
  });

  it('says nothing it cannot read of a Karpenter pool whose CR is missing', () => {
    const [pool] = awsNodePools(
      [machinePool('alder-spot', 'KarpenterMachinePool')],
      [],
      [],
      undefined,
    );
    expect(pool).toMatchObject({
      kind: 'karpenter',
      machine: undefined,
      zones: undefined,
      scaling: undefined,
    });
  });

  it('marks a machine pool short of nodes', () => {
    const [pool] = awsNodePools(
      [machinePool('alder-general', 'AWSMachinePool', 2, 3)],
      [awsMachinePool],
      [],
      undefined,
    );
    expect(formatNodesReady(pool)).toBe('2 of 3');
    expect(isShortOfNodes(pool)).toBe(true);
  });
});

describe('azureNodePools', () => {
  it('reads a MachineDeployment pool with its VM size and fixed size', () => {
    const [pool] = azureNodePools(
      [
        {
          id: 'hazel-def00',
          name: 'hazel-def00',
          desiredReplicas: 3,
          readyReplicas: 3,
          infrastructure: undefined,
          machineType: 'Standard_D4s_v5',
          machineSize: undefined,
          machineTypeDescription: '4 CPU · 16 GiB RAM · x86_64',
          phase: 'Running',
          created: '2026-04-01T00:00:00Z',
        },
      ],
      [],
    );
    expect(pool).toMatchObject({
      kind: 'machinePool',
      machine: 'Standard_D4s_v5',
      machineDetail: '4 CPU · 16 GiB',
      zones: undefined,
      scaling: '3 nodes',
    });
  });
});
