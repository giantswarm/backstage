import { AWSManagedMachinePool } from './AWSManagedMachinePool';

function makeMachinePool(spec: AWSManagedMachinePool['jsonData']['spec']) {
  return new AWSManagedMachinePool(
    {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
      kind: 'AWSManagedMachinePool',
      metadata: { name: 'eks-pool', namespace: 'org-test' },
      spec,
    },
    'installation-1',
  );
}

describe('AWSManagedMachinePool', () => {
  it('reads the instance type of the node group', () => {
    expect(
      makeMachinePool({ instanceType: 'r6i.xlarge' }).getInstanceType(),
    ).toBe('r6i.xlarge');
  });

  it('falls back to the launch template instance type', () => {
    expect(
      makeMachinePool({
        awsLaunchTemplate: { instanceType: 'm6i.large' },
      }).getInstanceType(),
    ).toBe('m6i.large');
  });
});
