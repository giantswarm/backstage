import { VSphereMachineTemplate } from '@giantswarm/backstage-plugin-kubernetes-react';

const BYTES_PER_MIB = 1024 * 1024;
const BYTES_PER_GIB = 1024 * BYTES_PER_MIB;

/** The resources one machine brings to a cluster. */
export type MachineSize = {
  vcpus: number;
  memoryBytes: number;
};

export type MachineTypeInfo = {
  /** Undefined when the dataset lacks the CPU count or the memory. */
  size?: MachineSize;
  architectures?: string[];
};

/** Looks up a provider machine type, e.g. `m5.xlarge` or `Standard_D4s_v3`. */
export type MachineTypeCatalog = (
  machineType: string,
) => MachineTypeInfo | undefined;

export type AwsInstanceTypeData = Record<
  string,
  {
    VCpuInfo?: { DefaultVCpus?: number };
    MemoryInfo?: { SizeInMiB?: number };
    ProcessorInfo?: { SupportedArchitectures?: string[] };
  }
>;

export type AzureVmSizeData = Record<
  string,
  { capabilities: { name: string; value: string }[] }
>;

function toMachineSize(
  vcpus: number | undefined,
  memoryBytes: number | undefined,
): MachineSize | undefined {
  const isPositive = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value > 0;

  return isPositive(vcpus) && isPositive(memoryBytes)
    ? { vcpus, memoryBytes }
    : undefined;
}

export function awsMachineTypeCatalog(
  data: AwsInstanceTypeData,
): MachineTypeCatalog {
  return instanceType => {
    const info = data[instanceType];
    if (!info) {
      return undefined;
    }

    const memoryMiB = info.MemoryInfo?.SizeInMiB;
    const architectures = info.ProcessorInfo?.SupportedArchitectures;

    return {
      size: toMachineSize(
        info.VCpuInfo?.DefaultVCpus,
        memoryMiB === undefined ? undefined : memoryMiB * BYTES_PER_MIB,
      ),
      architectures: architectures?.length ? architectures : undefined,
    };
  };
}

export function azureMachineTypeCatalog(
  data: AzureVmSizeData,
): MachineTypeCatalog {
  return vmSize => {
    const info = data[vmSize];
    if (!info) {
      return undefined;
    }

    const capability = (name: string) =>
      info.capabilities.find(c => c.name === name)?.value;
    // `vCPUsAvailable` is lower than `vCPUs` on constrained-vCPU sizes
    // (Standard_E4-2s_v3: 4 and 2), and it is what the node reports.
    const vcpus = capability('vCPUsAvailable') ?? capability('vCPUs');
    // Azure labels this "GB", but the values are GiB (Standard_D2s_v3: 8).
    const memoryGiB = capability('MemoryGB');
    const architecture = capability('CpuArchitectureType');

    return {
      size: toMachineSize(
        vcpus === undefined ? undefined : Number(vcpus),
        memoryGiB === undefined ? undefined : Number(memoryGiB) * BYTES_PER_GIB,
      ),
      architectures: architecture ? [architecture] : undefined,
    };
  };
}

/**
 * A template that leaves CPUs or memory unset inherits them from the vSphere
 * VM template it clones, which the CR does not reveal.
 */
export function vsphereMachineSize(
  template: VSphereMachineTemplate,
): MachineSize | undefined {
  const memoryMiB = template.getMemoryMiB();

  return toMachineSize(
    template.getNumCPUs(),
    memoryMiB === undefined ? undefined : memoryMiB * BYTES_PER_MIB,
  );
}

/** E.g. "4 vCPUs · 16 GiB RAM · arm64", for a machine type's tooltip. */
export function describeMachineType(
  info: MachineTypeInfo | undefined,
): string | undefined {
  if (!info) {
    return undefined;
  }

  const parts: string[] = [];
  if (info.size) {
    const memoryGiB = info.size.memoryBytes / BYTES_PER_GIB;
    parts.push(`${info.size.vcpus} vCPUs`);
    parts.push(
      `${memoryGiB % 1 === 0 ? memoryGiB : memoryGiB.toFixed(1)} GiB RAM`,
    );
  }
  if (info.architectures) {
    parts.push(info.architectures.join(', '));
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
