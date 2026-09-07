import { formatArchitecture, formatCapacityType } from './formatters';

/**
 * Grouping used to order and section the requirements readout.
 */
export type RequirementGroup = 'capacity' | 'compute' | 'topology' | 'other';

export type WellKnownKey = {
  label: string;
  group: RequirementGroup;
  /** Display order within the requirements block. Lower comes first. */
  order: number;
  /** Per-value display formatter. Values are shown verbatim when absent. */
  formatValue?: (value: string) => string;
  /** Appended after the values, e.g. `MiB` for instance-memory. */
  unit?: string;
};

export const CAPACITY_TYPE_KEY = 'karpenter.sh/capacity-type';
export const ARCH_KEY = 'kubernetes.io/arch';
export const OS_KEY = 'kubernetes.io/os';
export const INSTANCE_FAMILY_KEY = 'karpenter.k8s.aws/instance-family';
export const INSTANCE_CATEGORY_KEY = 'karpenter.k8s.aws/instance-category';
export const INSTANCE_GENERATION_KEY = 'karpenter.k8s.aws/instance-generation';
export const INSTANCE_SIZE_KEY = 'karpenter.k8s.aws/instance-size';
export const INSTANCE_TYPE_KEY = 'node.kubernetes.io/instance-type';
export const INSTANCE_CPU_KEY = 'karpenter.k8s.aws/instance-cpu';
export const INSTANCE_MEMORY_KEY = 'karpenter.k8s.aws/instance-memory';
export const ZONE_KEY = 'topology.kubernetes.io/zone';
export const REGION_KEY = 'topology.kubernetes.io/region';

export const WELL_KNOWN_REQUIREMENT_KEYS: Record<string, WellKnownKey> = {
  [CAPACITY_TYPE_KEY]: {
    label: 'Capacity type',
    group: 'capacity',
    order: 10,
    formatValue: formatCapacityType,
  },
  [ARCH_KEY]: {
    label: 'Architecture',
    group: 'capacity',
    order: 20,
    formatValue: formatArchitecture,
  },
  [OS_KEY]: { label: 'Operating system', group: 'capacity', order: 30 },

  [INSTANCE_CATEGORY_KEY]: {
    label: 'Instance categories',
    group: 'compute',
    order: 100,
  },
  [INSTANCE_FAMILY_KEY]: {
    label: 'Instance families',
    group: 'compute',
    order: 110,
  },
  [INSTANCE_GENERATION_KEY]: {
    label: 'Instance generation',
    group: 'compute',
    order: 120,
  },
  [INSTANCE_SIZE_KEY]: {
    label: 'Instance sizes',
    group: 'compute',
    order: 130,
  },
  [INSTANCE_TYPE_KEY]: {
    label: 'Instance types',
    group: 'compute',
    order: 140,
  },
  [INSTANCE_CPU_KEY]: { label: 'vCPUs', group: 'compute', order: 150 },
  [INSTANCE_MEMORY_KEY]: {
    label: 'Memory',
    group: 'compute',
    order: 160,
    unit: 'MiB',
  },
  'karpenter.k8s.aws/instance-hypervisor': {
    label: 'Hypervisor',
    group: 'compute',
    order: 170,
  },
  'karpenter.k8s.aws/instance-cpu-manufacturer': {
    label: 'CPU manufacturer',
    group: 'compute',
    order: 180,
  },
  'karpenter.k8s.aws/instance-local-nvme': {
    label: 'Local NVMe',
    group: 'compute',
    order: 190,
    unit: 'GiB',
  },
  'karpenter.k8s.aws/instance-gpu-count': {
    label: 'GPU count',
    group: 'compute',
    order: 200,
  },
  'karpenter.k8s.aws/instance-gpu-manufacturer': {
    label: 'GPU manufacturer',
    group: 'compute',
    order: 210,
  },
  'karpenter.k8s.aws/instance-gpu-name': {
    label: 'GPU model',
    group: 'compute',
    order: 220,
  },
  'karpenter.k8s.aws/instance-gpu-memory': {
    label: 'GPU memory',
    group: 'compute',
    order: 230,
    unit: 'MiB',
  },

  [ZONE_KEY]: { label: 'Availability zones', group: 'topology', order: 300 },
  [REGION_KEY]: { label: 'Region', group: 'topology', order: 310 },
  'karpenter.k8s.aws/instance-encryption-in-transit-supported': {
    label: 'Encryption in transit',
    group: 'compute',
    order: 240,
  },
};

export function getWellKnownKey(key: string): WellKnownKey | undefined {
  return WELL_KNOWN_REQUIREMENT_KEYS[key];
}
