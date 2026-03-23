import azureVmTypes from './data/azureVmTypes.json';

interface AzureVmCapability {
  name: string;
  value: string;
}

interface AzureVmType {
  capabilities: AzureVmCapability[];
}

const vmTypeData = azureVmTypes as Record<string, AzureVmType>;

function findCapability(
  capabilities: AzureVmCapability[],
  name: string,
): string | undefined {
  return capabilities.find(c => c.name === name)?.value;
}

export function getVmSizeTooltip(vmSize: string): string | undefined {
  const info = vmTypeData[vmSize];
  if (!info) return undefined;

  const caps = info.capabilities;
  const parts: string[] = [];

  const vcpus = findCapability(caps, 'vCPUs');
  if (vcpus) parts.push(`${vcpus} vCPUs`);

  const memGB = findCapability(caps, 'MemoryGB');
  if (memGB) parts.push(`${memGB} GiB RAM`);

  const arch = findCapability(caps, 'CpuArchitectureType');
  if (arch) parts.push(arch);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
