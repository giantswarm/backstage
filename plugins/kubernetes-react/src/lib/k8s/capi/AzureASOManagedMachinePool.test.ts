import {
  AzureASOManagedMachinePool,
  AzureASOManagedMachinePoolResource,
} from './AzureASOManagedMachinePool';

function makeMachinePool(resources?: AzureASOManagedMachinePoolResource[]) {
  return new AzureASOManagedMachinePool(
    {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
      kind: 'AzureASOManagedMachinePool',
      metadata: { name: 'aks-poc-system', namespace: 'org-test' },
      spec: { resources },
    },
    'installation-1',
  );
}

describe('AzureASOManagedMachinePool', () => {
  it('reads the VM size of the embedded agent pool', () => {
    const machinePool = makeMachinePool([
      {
        apiVersion: 'containerservice.azure.com/v1api20240901',
        kind: 'ManagedClustersAgentPool',
        metadata: { name: 'aks-poc-system' },
        spec: { vmSize: 'Standard_D4s_v3' },
      },
    ]);

    expect(machinePool.getVmSize()).toBe('Standard_D4s_v3');
  });

  it('returns undefined without an agent pool resource', () => {
    expect(makeMachinePool().getVmSize()).toBeUndefined();
    expect(
      makeMachinePool([
        {
          apiVersion: 'other.example.com/v1',
          kind: 'ManagedClustersAgentPool',
          spec: { vmSize: 'Standard_D4s_v3' },
        },
      ]).getVmSize(),
    ).toBeUndefined();
  });
});
