import { MachineSize } from './machineTypes';
import { NodePoolCapacityInput } from './nodePoolRows';
import { formatResourceQuantity } from './resourceFormat';

/** CPU and memory the ready nodes of one pool report, keyed by pool name. */
export type NodePoolMetrics = ReadonlyMap<string, MachineSize>;

export type WorkerCapacity = {
  /** Ready worker nodes, as the node pools report them. */
  nodes: number;
  vcpus: number;
  memoryBytes: number;
  /**
   * Pools with ready nodes whose CPU and memory are in neither the machine
   * size nor the node metrics. Their nodes count; their resources do not.
   */
  uncountedPools: string[];
};

function hasReadyNodes(pool: NodePoolCapacityInput): boolean {
  return (pool.readyReplicas ?? 0) > 0;
}

/**
 * Whether some pool can only be counted from node metrics: it has ready
 * nodes but no known machine size (Karpenter, AKS, VCD, an unknown type).
 */
export function needsNodeMetrics(pools: NodePoolCapacityInput[]): boolean {
  return pools.some(pool => hasReadyNodes(pool) && !pool.machineSize);
}

/**
 * Ready worker nodes times their machine size, summed over the node pools.
 * A pool without a known size takes the CPU and memory its ready nodes
 * report in `metrics` instead.
 */
export function computeWorkerCapacity(
  pools: NodePoolCapacityInput[],
  metrics?: NodePoolMetrics,
): WorkerCapacity {
  const capacity: WorkerCapacity = {
    nodes: 0,
    vcpus: 0,
    memoryBytes: 0,
    uncountedPools: [],
  };

  for (const pool of pools) {
    if (!hasReadyNodes(pool)) {
      continue;
    }

    const nodes = pool.readyReplicas ?? 0;
    capacity.nodes += nodes;

    if (pool.machineSize) {
      capacity.vcpus += nodes * pool.machineSize.vcpus;
      capacity.memoryBytes += nodes * pool.machineSize.memoryBytes;
      continue;
    }

    const observed = metrics?.get(pool.name);
    if (observed) {
      capacity.vcpus += observed.vcpus;
      capacity.memoryBytes += observed.memoryBytes;
    } else {
      capacity.uncountedPools.push(pool.name);
    }
  }

  return capacity;
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatWorkerNodes(nodes: number): string {
  return pluralize(nodes, 'node', 'nodes');
}

export function formatWorkerCpu(vcpus: number): string {
  return pluralize(Number(vcpus.toFixed(1)), 'vCPU', 'vCPUs');
}

export function formatWorkerMemory(memoryBytes: number): string {
  return formatResourceQuantity('memory', memoryBytes);
}
