import type {
  AWSMachinePool,
  AzureMachineTemplate,
  KarpenterMachinePool,
  MachineDeployment,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type AWSNodePoolRow,
  formatResourceName,
  formatResourceQuantity,
  formatWorkerCpu,
  formatWorkerMemory,
  type MachineSize,
  type NodePoolRow,
  parseResourceQuantity,
  shortenZone,
} from '../../clusters/nodePools';
import {
  CAPACITY_TYPE_KEY,
  formatCapacityType,
  formatLimits,
  getAllowedValues,
  INSTANCE_TYPE_KEY,
  parseRequirements,
  ZONE_KEY,
} from '../../clusters/cluster-details/ClusterNodePools/karpenter';

/** How a pool gets its machines: a fixed group of them, or Karpenter. */
export type PlatformNodePoolKind = 'machinePool' | 'karpenter';

/**
 * The availability zones of a pool: the zones in full (`eu-central-1a`);
 * any zone but some, or any, where a Karpenter pool's requirement says so;
 * undefined where unknown.
 */
export type PlatformNodePoolZones =
  string[] | { except: string[] } | 'any' | undefined;

/** One row of the Node pools tab, whatever the provider. */
export type PlatformNodePool = {
  id: string;
  name: string;
  kind: PlatformNodePoolKind;
  desiredReplicas: number | undefined;
  readyReplicas: number | undefined;
  /** The machine type, or "Mixed" where Karpenter picks among several. */
  machine: string | undefined;
  /** Under the machine: its size, or the capacity types Karpenter may pick. */
  machineDetail: string | undefined;
  zones: PlatformNodePoolZones;
  scaling: string | undefined;
  created: string | undefined;
  /** The resources the details read. */
  resources: {
    machinePool?: MachinePool;
    awsMachinePool?: AWSMachinePool;
    karpenterMachinePool?: KarpenterMachinePool;
    machineDeployment?: MachineDeployment;
    azureMachineTemplate?: AzureMachineTemplate;
  };
};

/** "4 CPU · 16 GiB", from the machine type catalogue's size. */
function formatMachineSize(size: MachineSize | undefined): string | undefined {
  return size
    ? `${formatWorkerCpu(size.vcpus)} · ${formatWorkerMemory(size.memoryBytes)}`
    : undefined;
}

function zoneLetters(zones: string[]): string {
  return zones.map(shortenZone).join(', ');
}

/** "A, B, C", "Any except C", "Any", or undefined. */
export function formatZones(zones: PlatformNodePoolZones): string | undefined {
  if (zones === 'any') {
    return 'Any';
  }
  if (zones && !Array.isArray(zones)) {
    return `Any except ${zoneLetters(zones.except)}`;
  }
  return zones?.length ? zoneLetters(zones) : undefined;
}

/** The zones in full, for the hover text. */
export function zonesTitle(zones: PlatformNodePoolZones): string | undefined {
  if (Array.isArray(zones)) {
    return zones.join(', ');
  }
  return zones && zones !== 'any'
    ? `Any except ${zones.except.join(', ')}`
    : undefined;
}

/** "Spot", "Spot and on-demand", "Spot, on-demand and reserved". */
function joinWithAnd(values: string[]): string {
  if (values.length <= 1) {
    return values.join('');
  }
  const [first, ...rest] = values;
  const tail = rest.map(value => value.toLowerCase());
  return `${[first, ...tail.slice(0, -1)].join(', ')} and ${tail[tail.length - 1]}`;
}

/**
 * A Karpenter limit as the pools table says it: "48 CPU", "192 GiB",
 * whatever quantity the CR writes (`48`, `48000m`, `192Gi`, `200G`, bytes).
 */
export function formatLimit(resource: string, value: string): string {
  const quantity = parseResourceQuantity(value);
  if (quantity === undefined) {
    return `${value} ${resource}`;
  }
  switch (resource) {
    case 'cpu':
      return `${formatResourceQuantity('cpu', quantity)} CPU`;
    case 'memory':
      return formatResourceQuantity('memory', quantity);
    default:
      return `${formatResourceQuantity(resource, quantity)} ${formatResourceName(resource).toLowerCase()}`;
  }
}

/** CPU first, then memory, then the rest, as a reader compares them. */
function limitOrder(resource: string): number {
  const index = ['cpu', 'memory'].indexOf(resource);
  return index === -1 ? 2 : index;
}

/** What the Karpenter pool's requirements and limits make of its row. */
function karpenterFacts(
  pool: KarpenterMachinePool | undefined,
): Pick<PlatformNodePool, 'machine' | 'machineDetail' | 'zones' | 'scaling'> {
  if (!pool) {
    return {
      machine: undefined,
      machineDetail: undefined,
      zones: undefined,
      scaling: undefined,
    };
  }
  const entries = parseRequirements(pool.getRequirements());
  const types = getAllowedValues(entries, INSTANCE_TYPE_KEY);
  const capacity = getAllowedValues(entries, CAPACITY_TYPE_KEY);
  const zones = getAllowedValues(entries, ZONE_KEY);
  const limits = formatLimits(pool.getLimits()).sort(
    (a, b) => limitOrder(a.resource) - limitOrder(b.resource),
  );

  let machineDetail: string | undefined;
  if (capacity?.allowed.length) {
    machineDetail = joinWithAnd(capacity.allowed.map(formatCapacityType));
  } else if (capacity?.excluded.length) {
    machineDetail = `Any except ${joinWithAnd(capacity.excluded.map(formatCapacityType)).toLowerCase()}`;
  }

  let poolZones: PlatformNodePoolZones = 'any';
  if (zones?.allowed.length) {
    poolZones = zones.allowed;
  } else if (zones?.excluded.length) {
    poolZones = { except: zones.excluded };
  }

  return {
    machine: types?.allowed.length === 1 ? types.allowed[0] : 'Mixed',
    machineDetail,
    zones: poolZones,
    scaling:
      limits.length === 0
        ? 'As needed, no limit'
        : `As needed, up to ${limits
            .map(limit => formatLimit(limit.resource, limit.value))
            .join(' · ')}`,
  };
}

/** "3 nodes", the size of a pool nothing scales; undefined when unknown. */
function fixedSize(count: number | undefined): string | undefined {
  return count === undefined ? undefined : nodeCount(count);
}

function nodeCount(count: number): string {
  return `${count} ${count === 1 ? 'node' : 'nodes'}`;
}

/** "Between 3 and 10 nodes", or the one size where both bounds are equal. */
function sizeRange(
  min: number | undefined,
  max: number | undefined,
): string | undefined {
  if (min === undefined || max === undefined) {
    return undefined;
  }
  return min === max ? nodeCount(min) : `Between ${min} and ${max} nodes`;
}

/**
 * The node pools of an AWS cluster, from the classic page's rows
 * (`buildAWSNodePoolRows`): each MachinePool with the AWSMachinePool (an
 * Auto Scaling group) or KarpenterMachinePool it points at.
 */
export function awsNodePools(rows: AWSNodePoolRow[]): PlatformNodePool[] {
  return rows.map(row => {
    const common = {
      id: row.id,
      name: row.name,
      desiredReplicas: row.desiredReplicas,
      readyReplicas: row.readyReplicas,
      created: row.created,
    };
    if (row.type === 'Karpenter') {
      return {
        ...common,
        kind: 'karpenter',
        ...karpenterFacts(row.karpenterMachinePool),
        resources: {
          machinePool: row.machinePool,
          karpenterMachinePool: row.karpenterMachinePool,
        },
      };
    }
    return {
      ...common,
      kind: 'machinePool',
      machine: row.instanceType,
      machineDetail: formatMachineSize(row.machineSize),
      zones: row.availabilityZones,
      scaling: sizeRange(row.minSize, row.maxSize),
      resources: {
        machinePool: row.machinePool,
        awsMachinePool: row.awsMachinePool,
      },
    };
  });
}

/**
 * The node pools of an Azure cluster, from the classic page's rows
 * (`buildNodePoolRows`): its MachineDeployments with their
 * AzureMachineTemplates. A MachineDeployment the cluster-autoscaler scales
 * has its bounds in annotations; one without them has a fixed size.
 */
export function azureNodePools(
  rows: NodePoolRow<AzureMachineTemplate>[],
): PlatformNodePool[] {
  return rows.map(row => {
    const machineDeployment = row.pool as MachineDeployment;
    const range = machineDeployment.getAutoscalerRange();
    return {
      id: row.id,
      name: row.name,
      kind: 'machinePool',
      desiredReplicas: row.desiredReplicas,
      readyReplicas: row.readyReplicas,
      machine: row.machineType,
      machineDetail: formatMachineSize(row.machineSize),
      zones: undefined,
      scaling: range
        ? sizeRange(range.min, range.max)
        : fixedSize(row.desiredReplicas),
      created: row.created,
      resources: {
        machineDeployment,
        azureMachineTemplate: row.infrastructure,
      },
    };
  });
}

/** "6 of 6", or "6 ready" for a Karpenter pool, which has no fixed size. */
export function formatNodesReady(pool: PlatformNodePool): string | undefined {
  const ready = pool.readyReplicas;
  if (pool.kind === 'karpenter' || pool.desiredReplicas === undefined) {
    return ready === undefined ? undefined : `${ready} ready`;
  }
  return `${ready ?? 0} of ${pool.desiredReplicas}`;
}

/** Whether a machine pool has fewer nodes ready than it wants. */
export function isShortOfNodes(pool: PlatformNodePool): boolean {
  return (
    pool.kind === 'machinePool' &&
    pool.desiredReplicas !== undefined &&
    (pool.readyReplicas ?? 0) < pool.desiredReplicas
  );
}

/** The kind as the pools table's sub-line names it. */
export function kindLabel(kind: PlatformNodePoolKind): string {
  return kind === 'karpenter' ? 'Karpenter' : 'Machine pool';
}
