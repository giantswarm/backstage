import { VSphereMachineTemplate } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  awsMachineTypeCatalog,
  azureMachineTypeCatalog,
  describeMachineType,
  vsphereMachineSize,
} from './machineTypes';

const GIB = 1024 ** 3;

describe('awsMachineTypeCatalog', () => {
  const catalog = awsMachineTypeCatalog({
    'm6g.xlarge': {
      VCpuInfo: { DefaultVCpus: 4 },
      MemoryInfo: { SizeInMiB: 16384 },
      ProcessorInfo: { SupportedArchitectures: ['arm64'] },
    },
    'x.partial': { VCpuInfo: { DefaultVCpus: 2 } },
  });

  it('reads the size and architectures of an instance type', () => {
    expect(catalog('m6g.xlarge')).toEqual({
      size: { vcpus: 4, memoryBytes: 16 * GIB },
      architectures: ['arm64'],
    });
  });

  it('has no size without both CPU and memory, and nothing for unknown types', () => {
    expect(catalog('x.partial')?.size).toBeUndefined();
    expect(catalog('unknown')).toBeUndefined();
  });
});

describe('azureMachineTypeCatalog', () => {
  it('reads Azure "MemoryGB" as GiB', () => {
    const catalog = azureMachineTypeCatalog({
      Standard_D2s_v3: {
        capabilities: [
          { name: 'vCPUs', value: '2' },
          { name: 'MemoryGB', value: '8' },
          { name: 'CpuArchitectureType', value: 'x64' },
        ],
      },
    });

    expect(catalog('Standard_D2s_v3')).toEqual({
      size: { vcpus: 2, memoryBytes: 8 * GIB },
      architectures: ['x64'],
    });
  });
});

describe('vsphereMachineSize', () => {
  function template(spec: { numCPUs?: number; memoryMiB?: number }) {
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
      'installation',
    );
  }

  it('is the template CPU count and memory', () => {
    expect(
      vsphereMachineSize(template({ numCPUs: 8, memoryMiB: 32768 })),
    ).toEqual({ vcpus: 8, memoryBytes: 32 * GIB });
  });

  it('is unknown when the size comes from the vSphere VM template', () => {
    expect(vsphereMachineSize(template({ numCPUs: 8 }))).toBeUndefined();
  });
});

describe('describeMachineType', () => {
  it('lists CPUs, memory and architectures', () => {
    expect(
      describeMachineType({
        size: { vcpus: 2, memoryBytes: 0.5 * GIB },
        architectures: ['arm64'],
      }),
    ).toBe('2 vCPUs · 0.5 GiB RAM · arm64');
  });

  it('is undefined for an unknown machine type', () => {
    expect(describeMachineType(undefined)).toBeUndefined();
  });
});
