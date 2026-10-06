import { VSphereMachineTemplate } from './VSphereMachineTemplate';

function makeTemplate(spec: { numCPUs?: number; memoryMiB?: number }) {
  return new VSphereMachineTemplate(
    {
      apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
      kind: 'VSphereMachineTemplate',
      metadata: { name: 'worker', namespace: 'org-test' },
      spec: {
        template: {
          spec: { template: 'flatcar', network: { devices: [] }, ...spec },
        },
      },
    },
    'installation-1',
  );
}

describe('VSphereMachineTemplate', () => {
  it('reads the CPU count and memory from the template spec', () => {
    const template = makeTemplate({ numCPUs: 4, memoryMiB: 16384 });

    expect(template.getNumCPUs()).toBe(4);
    expect(template.getMemoryMiB()).toBe(16384);
  });

  it('returns undefined when the size is inherited from the vSphere template', () => {
    const template = makeTemplate({});

    expect(template.getNumCPUs()).toBeUndefined();
    expect(template.getMemoryMiB()).toBeUndefined();
  });
});
