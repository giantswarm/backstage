import {
  AWSMachinePool,
  AWSManagedMachinePool,
  AzureASOManagedMachinePool,
  AzureMachineTemplate,
  Cluster,
  MachineDeployment,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { NodePoolResources, getClusterNodePools } from './clusterNodePools';
import { awsMachineTypeCatalog, azureMachineTypeCatalog } from './machineTypes';

const GIB = 1024 ** 3;
const INSTALLATION = 'installation';

function cluster(infrastructureKind: string, namespace = 'org-a') {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: { name: 'c1', namespace },
      spec: {
        infrastructureRef: {
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: infrastructureKind,
          name: 'c1',
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    INSTALLATION,
  );
}

function pool<T>(
  Model: new (json: any, installation: string) => T,
  kind: string,
  name: string,
  infraKind: string,
  { namespace = 'org-a', clusterName = 'c1', ready = 2 } = {},
) {
  return new Model(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind,
      metadata: {
        name,
        namespace,
        labels: { 'cluster.x-k8s.io/cluster-name': clusterName },
      },
      spec: {
        template: {
          spec: {
            infrastructureRef: {
              apiGroup: 'infrastructure.cluster.x-k8s.io',
              kind: infraKind,
              name,
            },
          },
        },
      },
      status: { readyReplicas: ready },
    },
    INSTALLATION,
  );
}

const awsMachinePool = (name: string, namespace = 'org-a') =>
  new AWSMachinePool(
    {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
      kind: 'AWSMachinePool',
      metadata: { name, namespace },
      spec: { awsLaunchTemplate: { instanceType: 'm5.xlarge' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    INSTALLATION,
  );

const azureTemplate = (name: string) =>
  new AzureMachineTemplate(
    {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
      kind: 'AzureMachineTemplate',
      metadata: { name, namespace: 'org-a' },
      spec: { template: { spec: { vmSize: 'Standard_D2s_v3' } } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    INSTALLATION,
  );

const empty: NodePoolResources = {
  machinePools: [],
  awsMachinePools: [],
  awsManagedMachinePools: [],
  azureASOManagedMachinePools: [],
  machineDeployments: [],
  azureMachineTemplates: [],
  vsphereMachineTemplates: [],
};

const catalogs = {
  aws: awsMachineTypeCatalog({
    'm5.xlarge': {
      VCpuInfo: { DefaultVCpus: 4 },
      MemoryInfo: { SizeInMiB: 16384 },
    },
  }),
  azure: azureMachineTypeCatalog({
    Standard_D2s_v3: {
      capabilities: [
        { name: 'vCPUs', value: '2' },
        { name: 'MemoryGB', value: '8' },
      ],
    },
  }),
};

describe('getClusterNodePools', () => {
  it('sizes AWS pools by instance type and leaves Karpenter pools unsized', () => {
    const pools = getClusterNodePools(
      cluster('AWSCluster'),
      {
        ...empty,
        machinePools: [
          pool(MachinePool, 'MachinePool', 'c1-asg', 'AWSMachinePool'),
          pool(
            MachinePool,
            'MachinePool',
            'c1-karpenter',
            'KarpenterMachinePool',
          ),
        ],
        awsMachinePools: [awsMachinePool('c1-asg')],
      },
      catalogs,
    );

    expect(
      pools?.map(({ name, readyReplicas, machineSize }) => ({
        name,
        readyReplicas,
        machineSize,
      })),
    ).toEqual([
      {
        name: 'c1-asg',
        readyReplicas: 2,
        machineSize: { vcpus: 4, memoryBytes: 16 * GIB },
      },
      { name: 'c1-karpenter', readyReplicas: 2, machineSize: undefined },
    ]);
  });

  it('keeps only the pools and templates of the cluster’s own namespace', () => {
    // Another organization reuses the cluster and pool names.
    const pools = getClusterNodePools(
      cluster('AWSCluster'),
      {
        ...empty,
        machinePools: [
          pool(MachinePool, 'MachinePool', 'c1-asg', 'AWSMachinePool'),
          pool(MachinePool, 'MachinePool', 'c1-asg', 'AWSMachinePool', {
            namespace: 'org-b',
          }),
          pool(MachinePool, 'MachinePool', 'c2-asg', 'AWSMachinePool', {
            clusterName: 'c2',
          }),
        ],
        awsMachinePools: [awsMachinePool('c1-asg', 'org-b')],
      },
      catalogs,
    );

    expect(pools).toHaveLength(1);
    expect(pools?.[0].machineSize).toBeUndefined();
  });

  it('sizes Azure pools by the VM size of their template', () => {
    const pools = getClusterNodePools(
      cluster('AzureCluster'),
      {
        ...empty,
        machineDeployments: [
          pool(
            MachineDeployment,
            'MachineDeployment',
            'c1-def00',
            'AzureMachineTemplate',
          ),
        ],
        azureMachineTemplates: [azureTemplate('c1-def00')],
      },
      catalogs,
    );

    expect(pools?.[0].machineSize).toEqual({ vcpus: 2, memoryBytes: 8 * GIB });
  });

  it('sizes EKS pools by the instance type of their node group', () => {
    const nodeGroup = new AWSManagedMachinePool(
      {
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
        kind: 'AWSManagedMachinePool',
        metadata: { name: 'c1-pool0', namespace: 'org-a' },
        spec: { instanceType: 'm5.xlarge' },
      },
      INSTALLATION,
    );

    const pools = getClusterNodePools(
      cluster('AWSManagedCluster'),
      {
        ...empty,
        machinePools: [
          pool(MachinePool, 'MachinePool', 'c1-pool0', 'AWSManagedMachinePool'),
        ],
        awsManagedMachinePools: [nodeGroup],
      },
      catalogs,
    );

    expect(pools?.[0].machineSize).toEqual({
      vcpus: 4,
      memoryBytes: 16 * GIB,
    });
  });

  it('sizes AKS pools by the VM size of their agent pool', () => {
    const agentPool = new AzureASOManagedMachinePool(
      {
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
        kind: 'AzureASOManagedMachinePool',
        metadata: { name: 'c1-system', namespace: 'org-a' },
        spec: {
          resources: [
            {
              apiVersion: 'containerservice.azure.com/v1api20240901',
              kind: 'ManagedClustersAgentPool',
              spec: { vmSize: 'Standard_D2s_v3' },
            },
          ],
        },
      },
      INSTALLATION,
    );

    const pools = getClusterNodePools(
      cluster('AzureASOManagedCluster'),
      {
        ...empty,
        machinePools: [
          pool(
            MachinePool,
            'MachinePool',
            'c1-system',
            'AzureASOManagedMachinePool',
          ),
        ],
        azureASOManagedMachinePools: [agentPool],
      },
      catalogs,
    );

    expect(pools?.[0].machineSize).toEqual({ vcpus: 2, memoryBytes: 8 * GIB });
  });

  it('leaves VCD pools unsized and has no pools for an unknown provider', () => {
    const vcdPools = getClusterNodePools(
      cluster('VCDCluster'),
      {
        ...empty,
        machineDeployments: [
          pool(
            MachineDeployment,
            'MachineDeployment',
            'c1-worker',
            'VCDMachineTemplate',
          ),
        ],
      },
      catalogs,
    );

    expect(vcdPools).toEqual([
      expect.objectContaining({
        name: 'c1-worker',
        readyReplicas: 2,
        machineSize: undefined,
      }),
    ]);
    expect(
      getClusterNodePools(cluster('SomethingElse'), empty, catalogs),
    ).toBeUndefined();
  });
});
