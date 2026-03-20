import awsInstanceTypes from './NodePoolNodes/awsInstanceTypes.json';

const instanceTypeData = awsInstanceTypes as Record<
  string,
  {
    VCpuInfo?: { DefaultVCpus?: number };
    MemoryInfo?: { SizeInMiB?: number };
    ProcessorInfo?: { SupportedArchitectures?: string[] };
  }
>;

export function getInstanceTypeTooltip(
  instanceType: string,
): string | undefined {
  const info = instanceTypeData[instanceType];
  if (!info) return undefined;

  const parts: string[] = [];
  const vcpus = info.VCpuInfo?.DefaultVCpus;
  if (vcpus !== undefined) parts.push(`${vcpus} vCPUs`);

  const memMiB = info.MemoryInfo?.SizeInMiB;
  if (memMiB !== undefined) {
    const memGiB = memMiB / 1024;
    parts.push(`${memGiB % 1 === 0 ? memGiB : memGiB.toFixed(1)} GiB RAM`);
  }

  const arch = info.ProcessorInfo?.SupportedArchitectures;
  if (arch?.length) parts.push(arch.join(', '));

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
