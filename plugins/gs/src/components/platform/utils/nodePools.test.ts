import {
  AWSMachinePool,
  AzureMachineTemplate,
  KarpenterMachinePool,
  MachineDeployment,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  buildAWSNodePoolRows,
  buildNodePoolRows,
  describeAzureVmSize,
} from '../../clusters/nodePools';
import {
  awsNodePools,
  azureNodePools,
  formatLimit,
  formatNodesReady,
  formatZones,
  isShortOfNodes,
} from './nodePools';

const INSTALLATION = 'meadow';
const NAMESPACE = 'org-fern';
const GIB = 1024 ** 3;

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

/** The Platform rows of one Karpenter pool with these requirements and limits. */
function karpenter(requirements: object[], limits?: object) {
  return awsNodePools(
    buildAWSNodePoolRows(
      [machinePool('alder-spot', 'KarpenterMachinePool')],
      [],
      [karpenterPool(requirements, limits)],
      undefined,
    ),
  )[0];
}

const CAPACITY = {
  key: 'karpenter.sh/capacity-type',
  operator: 'In',
  values: ['spot', 'on-demand'],
};

describe('awsNodePools', () => {
  it('reads an Auto Scaling group pool as a machine pool', () => {
    const [pool] = awsNodePools(
      buildAWSNodePoolRows(
        [machinePool('alder-general', 'AWSMachinePool')],
        [awsMachinePool],
        [],
        () => ({ size: { vcpus: 4, memoryBytes: 16 * GIB } }),
      ),
    );
    expect(pool).toMatchObject({
      name: 'alder-general',
      kind: 'machinePool',
      machine: 'm6i.xlarge',
      machineDetail: '4 CPU · 16 GiB',
      scaling: 'Between 3 and 10 nodes',
    });
    expect(pool.resources.awsMachinePool).toBe(awsMachinePool);
    expect(formatZones(pool.zones)).toBe('A, B, C');
    expect(formatNodesReady(pool)).toBe('6 of 6');
  });

  it('reads a Karpenter pool from its requirements and limits', () => {
    const pool = karpenter([CAPACITY], { cpu: 48, memory: '192Gi' });
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
    const pool = karpenter([
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
    ]);
    expect(pool.machine).toBe('c5a.xlarge');
    expect(formatZones(pool.zones)).toBe('A, B');
    expect(pool.scaling).toBe('As needed, no limit');
  });

  it('says what a NotIn requirement leaves out', () => {
    const pool = karpenter([
      {
        key: 'karpenter.sh/capacity-type',
        operator: 'NotIn',
        values: ['spot'],
      },
      {
        key: 'topology.kubernetes.io/zone',
        operator: 'NotIn',
        values: ['eu-central-1c'],
      },
    ]);
    expect(pool.machineDetail).toBe('Any except spot');
    expect(formatZones(pool.zones)).toBe('Any except C');
  });

  it('says nothing it cannot read of a Karpenter pool whose CR is missing', () => {
    const [pool] = awsNodePools(
      buildAWSNodePoolRows(
        [machinePool('alder-spot', 'KarpenterMachinePool')],
        [],
        [],
        undefined,
      ),
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
      buildAWSNodePoolRows(
        [machinePool('alder-general', 'AWSMachinePool', 2, 3)],
        [awsMachinePool],
        [],
        undefined,
      ),
    );
    expect(formatNodesReady(pool)).toBe('2 of 3');
    expect(isShortOfNodes(pool)).toBe(true);
  });
});

describe('formatLimit', () => {
  it.each([
    ['cpu', '48', '48 CPU'],
    ['cpu', '48000m', '48 CPU'],
    ['memory', '192Gi', '192 GiB'],
    ['memory', String(200 * GIB), '200 GiB'],
    ['memory', '1Ti', '1024 GiB'],
    ['memory', '512Mi', '512 MiB'],
    ['nodes', '20', '20 nodes'],
    ['cpu', 'lots', 'lots cpu'],
  ])('%s %s → %s', (resource, value, expected) => {
    expect(formatLimit(resource, value)).toBe(expected);
  });
});

describe('azureNodePools', () => {
  function deployment(annotations?: Record<string, string>) {
    return new MachineDeployment(
      {
        apiVersion: 'cluster.x-k8s.io/v1beta2',
        kind: 'MachineDeployment',
        metadata: {
          name: 'hazel-def00',
          namespace: NAMESPACE,
          ...(annotations && { annotations }),
        },
        spec: {
          clusterName: 'hazel',
          replicas: 3,
          template: {
            spec: {
              clusterName: 'hazel',
              infrastructureRef: {
                kind: 'AzureMachineTemplate',
                name: 'hazel-def00',
              },
            },
          },
        },
        status: { readyReplicas: 3 },
      } as any,
      INSTALLATION,
    );
  }
  const template = new AzureMachineTemplate(
    {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
      kind: 'AzureMachineTemplate',
      metadata: { name: 'hazel-def00', namespace: NAMESPACE },
      spec: { template: { spec: { vmSize: 'Standard_D4s_v5' } } },
    } as any,
    INSTALLATION,
  );
  const pools = (md: MachineDeployment) =>
    azureNodePools(
      buildNodePoolRows(
        [md],
        [template],
        describeAzureVmSize(() => ({
          size: { vcpus: 4, memoryBytes: 16 * GIB },
        })),
      ),
    );

  it('reads a MachineDeployment pool with its VM size and fixed size', () => {
    expect(pools(deployment())[0]).toMatchObject({
      kind: 'machinePool',
      machine: 'Standard_D4s_v5',
      machineDetail: '4 CPU · 16 GiB',
      zones: undefined,
      scaling: '3 nodes',
    });
  });

  it("reads the cluster-autoscaler's bounds where it scales the pool", () => {
    const [pool] = pools(
      deployment({
        'cluster.x-k8s.io/cluster-api-autoscaler-node-group-min-size': '3',
        'cluster.x-k8s.io/cluster-api-autoscaler-node-group-max-size': '10',
      }),
    );
    expect(pool.scaling).toBe('Between 3 and 10 nodes');
  });
});
