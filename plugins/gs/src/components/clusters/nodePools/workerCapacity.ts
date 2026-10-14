import { MachineSize } from './machineTypes';
import { NodePoolCapacityInput } from './nodePoolRows';
import { formatResourceQuantity } from './resourceFormat';

/** What the Ready nodes of one pool report, keyed by pool name. */
export type NodePoolMetrics = Readonly<
  Record<string, MachineSize & { nodes: number }>
>;

export type WorkerCapacity = {
  /**
   * Ready worker nodes: as the node pools report them, or as the node
   * metrics do for a pool whose CPU and memory come from them.
   */
  nodes: number;
  vcpus: number;
  memoryBytes: number;
  /**
   * Pools with ready nodes whose CPU and memory are in neither the machine
   * size nor the node metrics. Their nodes count; their resources do not.
   */
  uncountedPools: string[];
};

/**
 * Whether some pool can only be counted from node metrics: it has no known
 * machine size (Karpenter, AKS, VCD, an unknown type). Its ready count on the
 * CR does not decide this, since the CR can lag the nodes.
 */
export function needsNodeMetrics(pools: NodePoolCapacityInput[]): boolean {
  return pools.some(pool => !pool.machineSize);
}

/**
 * Ready worker nodes times their machine size, summed over the node pools.
 * A pool without a known size takes its Ready nodes, CPU and memory from
 * `metrics` instead, so all three describe the same nodes; only when the
 * metrics lack it does its CR's ready count stand in for the nodes.
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
    const readyReplicas = pool.readyReplicas ?? 0;

    if (pool.machineSize) {
      capacity.nodes += readyReplicas;
      capacity.vcpus += readyReplicas * pool.machineSize.vcpus;
      capacity.memoryBytes += readyReplicas * pool.machineSize.memoryBytes;
      continue;
    }

    const observed = metrics?.[pool.name];
    if (observed) {
      capacity.nodes += observed.nodes;
      capacity.vcpus += observed.vcpus;
      capacity.memoryBytes += observed.memoryBytes;
    } else if (readyReplicas > 0) {
      capacity.nodes += readyReplicas;
      capacity.uncountedPools.push(pool.name);
    }
  }

  return capacity;
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Whether no pool with ready nodes had its CPU and memory counted. */
export function hasUnknownResources(capacity: WorkerCapacity): boolean {
  return (
    capacity.uncountedPools.length > 0 &&
    capacity.vcpus === 0 &&
    capacity.memoryBytes === 0
  );
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
