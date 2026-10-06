import { VSphereMachineTemplate } from './VSphereMachineTemplate';

function makeTemplate(
  spec: { numCPUs?: number; memoryMiB?: number },
  version: 'v1beta1' | 'v1beta2' = 'v1beta1',
) {
  return new VSphereMachineTemplate(
    {
      apiVersion: `infrastructure.cluster.x-k8s.io/${version}`,
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

  it('reads the same fields from a v1beta2 template', () => {
    const template = makeTemplate({ numCPUs: 8, memoryMiB: 32768 }, 'v1beta2');

    expect(template.isV1Beta2()).toBe(true);
    expect(template.getNumCPUs()).toBe(8);
    expect(template.getMemoryMiB()).toBe(32768);
  });

  it('returns undefined when the size is inherited from the vSphere template', () => {
    const template = makeTemplate({});

    expect(template.getNumCPUs()).toBeUndefined();
    expect(template.getMemoryMiB()).toBeUndefined();
  });
});
