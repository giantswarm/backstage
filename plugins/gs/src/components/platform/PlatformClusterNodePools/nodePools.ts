import type {
  AWSMachinePool,
  AzureMachineTemplate,
  KarpenterMachinePool,
  MachineDeployment,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type AWSNodePoolRow,
  type MachineTypeCatalog,
  type NodePoolRow,
  buildAWSNodePoolRows,
  formatResourceQuantity,
  resolveAWSNodePoolInfra,
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
  /**
   * The availability zones, in full (`eu-central-1a`); `any` where a
   * Karpenter pool sets no zone requirement; undefined where unknown.
   */
  zones: string[] | 'any' | undefined;
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

/** "4 CPU · 16 GiB RAM" → "4 CPU · 16 GiB", as the pools table says it. */
function machineSize(description: string | undefined): string | undefined {
  return description
    ?.split(' · ')
    .filter(part => /CPU$|GiB RAM$/.test(part))
    .map(part => part.replace(/ RAM$/, ''))
    .join(' · ');
}

/** `eu-central-1a` → `A`, as the tables shorten a zone. */
export function zoneLetter(zone: string): string {
  return zone.slice(-1).toUpperCase();
}

/** "A, B, C", or "Any", or undefined. */
export function formatZones(
  zones: PlatformNodePool['zones'],
): string | undefined {
  if (zones === 'any') {
    return 'Any';
  }
  return zones?.length ? zones.map(zoneLetter).join(', ') : undefined;
}

function joinWithAnd(values: string[]): string {
  if (values.length <= 1) {
    return values.join('');
  }
  const [first, ...rest] = values;
  const tail = rest.map(value => value.toLowerCase());
  return `${[first, ...tail.slice(0, -1)].join(', ')} and ${tail[tail.length - 1]}`;
}

/** A Karpenter limit as the pools table says it: "48 CPU", "192 GiB". */
function formatLimit(resource: string, value: string): string {
  const quantity = /^\d+(\.\d+)?$/.test(value) ? Number(value) : undefined;
  switch (resource) {
    case 'cpu':
      return `${value} CPU`;
    case 'memory':
      return value.replace(/Gi$/, ' GiB').replace(/Mi$/, ' MiB');
    default:
      return quantity !== undefined
        ? `${formatResourceQuantity(resource, quantity)} ${resource}`
        : `${value} ${resource}`;
  }
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
  const limits = formatLimits(pool.getLimits());
  // CPU first, then memory, then the rest, as a reader compares them.
  const order = (resource: string) =>
    ['cpu', 'memory'].indexOf(resource) === -1
      ? 2
      : ['cpu', 'memory'].indexOf(resource);
  const sorted = [...limits].sort(
    (a, b) => order(a.resource) - order(b.resource),
  );
  return {
    machine: types && types.allowed.length === 1 ? types.allowed[0] : 'Mixed',
    machineDetail:
      capacity && capacity.allowed.length > 0
        ? joinWithAnd(capacity.allowed.map(formatCapacityType))
        : undefined,
    zones: zones && zones.allowed.length > 0 ? zones.allowed : 'any',
    scaling:
      sorted.length === 0
        ? 'As needed, no limit'
        : `As needed, up to ${sorted
            .map(limit => formatLimit(limit.resource, limit.value))
            .join(' · ')}`,
  };
}

function sizeRange(
  minSize: number | undefined,
  maxSize: number | undefined,
): string | undefined {
  if (minSize === undefined || maxSize === undefined) {
    return undefined;
  }
  return minSize === maxSize
    ? `${minSize} ${minSize === 1 ? 'node' : 'nodes'}`
    : `Between ${minSize} and ${maxSize} nodes`;
}

/**
 * The node pools of an AWS cluster: its MachinePools, each with the
 * AWSMachinePool (an Auto Scaling group) or KarpenterMachinePool it points
 * at, read as the classic cluster page reads them (`buildAWSNodePoolRows`).
 */
export function awsNodePools(
  machinePools: MachinePool[],
  awsMachinePools: AWSMachinePool[],
  karpenterMachinePools: KarpenterMachinePool[],
  catalog: MachineTypeCatalog | undefined,
): PlatformNodePool[] {
  const rows = buildAWSNodePoolRows(
    machinePools,
    awsMachinePools,
    karpenterMachinePools,
    catalog,
  );
  const byName = new Map<string, AWSNodePoolRow>(
    rows.map(row => [row.name, row]),
  );
  return machinePools.map(machinePool => {
    const row = byName.get(machinePool.getName())!;
    const infra = resolveAWSNodePoolInfra(
      machinePool,
      awsMachinePools,
      karpenterMachinePools,
    );
    const common = {
      id: row.id,
      name: row.name,
      desiredReplicas: row.desiredReplicas,
      readyReplicas: row.readyReplicas,
      created: row.created,
    };
    if (infra.type === 'Karpenter') {
      return {
        ...common,
        kind: 'karpenter',
        ...karpenterFacts(infra.karpenterMachinePool),
        resources: {
          machinePool,
          karpenterMachinePool: infra.karpenterMachinePool,
        },
      };
    }
    return {
      ...common,
      kind: 'machinePool',
      machine: row.instanceType,
      machineDetail: machineSize(row.machineTypeDescription),
      zones: row.availabilityZones,
      scaling: sizeRange(row.minSize, row.maxSize),
      resources: { machinePool, awsMachinePool: infra.awsMachinePool },
    };
  });
}

/**
 * The node pools of an Azure cluster: its MachineDeployments with their
 * AzureMachineTemplates, from the classic page's rows (`buildNodePoolRows`).
 * A MachineDeployment has a fixed size and its template no zones.
 */
export function azureNodePools(
  rows: NodePoolRow<AzureMachineTemplate>[],
  machineDeployments: MachineDeployment[],
): PlatformNodePool[] {
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    kind: 'machinePool',
    desiredReplicas: row.desiredReplicas,
    readyReplicas: row.readyReplicas,
    machine: row.machineType,
    machineDetail: machineSize(row.machineTypeDescription),
    zones: undefined,
    scaling:
      row.desiredReplicas === undefined
        ? undefined
        : `${row.desiredReplicas} ${row.desiredReplicas === 1 ? 'node' : 'nodes'}`,
    created: row.created,
    resources: {
      machineDeployment: machineDeployments.find(d => d.getName() === row.name),
      azureMachineTemplate: row.infrastructure,
    },
  }));
}

/** "6 of 6", or "6 ready" for a Karpenter pool, which has no fixed size. */
export function formatNodesReady(pool: PlatformNodePool): string | undefined {
  const ready = pool.readyReplicas;
  if (pool.kind === 'karpenter') {
    return ready === undefined ? undefined : `${ready} ready`;
  }
  if (pool.desiredReplicas === undefined) {
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
