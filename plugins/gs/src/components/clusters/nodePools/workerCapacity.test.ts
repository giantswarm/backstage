import {
  computeWorkerCapacity,
  formatWorkerCpu,
  formatWorkerMemory,
  formatWorkerNodes,
  hasUnknownResources,
  needsNodeMetrics,
} from './workerCapacity';

const GIB = 1024 ** 3;
const m5xlarge = { vcpus: 4, memoryBytes: 16 * GIB };

describe('computeWorkerCapacity', () => {
  it('multiplies the ready nodes of each pool by its machine size', () => {
    expect(
      computeWorkerCapacity([
        { name: 'a', readyReplicas: 3, machineSize: m5xlarge },
        { name: 'b', readyReplicas: 1, machineSize: m5xlarge },
      ]),
    ).toEqual({
      nodes: 4,
      vcpus: 16,
      memoryBytes: 64 * GIB,
      uncountedPools: [],
    });
  });

  it('takes the nodes, CPU and memory of a pool without a size from node metrics', () => {
    // The pool reports 3 ready machines; one node is not ready to the
    // machine controller but Ready to Kubernetes, which the metrics count.
    const metrics = {
      karpenter: { nodes: 4, vcpus: 16, memoryBytes: 64 * GIB },
    };

    expect(
      computeWorkerCapacity(
        [
          { name: 'a', readyReplicas: 1, machineSize: m5xlarge },
          { name: 'karpenter', readyReplicas: 3, machineSize: undefined },
        ],
        metrics,
      ),
    ).toEqual({
      nodes: 5,
      vcpus: 20,
      memoryBytes: 80 * GIB,
      uncountedPools: [],
    });
  });

  it('counts the nodes but not the resources of a pool missing from the metrics', () => {
    expect(
      computeWorkerCapacity(
        [
          { name: 'a', readyReplicas: 1, machineSize: m5xlarge },
          { name: 'aks', readyReplicas: 2, machineSize: undefined },
        ],
        {},
      ),
    ).toEqual({
      nodes: 3,
      vcpus: 4,
      memoryBytes: 16 * GIB,
      uncountedPools: ['aks'],
    });
  });

  it('counts a pool from node metrics while its CR reports no ready nodes', () => {
    // A Karpenter pool scaled up between two reconciles of its MachinePool.
    expect(
      computeWorkerCapacity(
        [
          {
            name: 'karpenter',
            readyReplicas: undefined,
            machineSize: undefined,
          },
        ],
        { karpenter: { nodes: 2, vcpus: 8, memoryBytes: 32 * GIB } },
      ),
    ).toEqual({
      nodes: 2,
      vcpus: 8,
      memoryBytes: 32 * GIB,
      uncountedPools: [],
    });
  });

  it('skips a pool without a size that neither its CR nor the metrics count', () => {
    expect(
      computeWorkerCapacity(
        [
          { name: 'empty', readyReplicas: 0, machineSize: undefined },
          { name: 'sized', readyReplicas: 0, machineSize: m5xlarge },
        ],
        {},
      ),
    ).toEqual({
      nodes: 0,
      vcpus: 0,
      memoryBytes: 0,
      uncountedPools: [],
    });
  });
});

describe('hasUnknownResources', () => {
  it('is true only when no pool had its CPU and memory counted', () => {
    const unknown = computeWorkerCapacity(
      [{ name: 'vcd', readyReplicas: 3, machineSize: undefined }],
      {},
    );
    const partial = computeWorkerCapacity(
      [
        { name: 'a', readyReplicas: 1, machineSize: m5xlarge },
        { name: 'vcd', readyReplicas: 3, machineSize: undefined },
      ],
      {},
    );

    expect(hasUnknownResources(unknown)).toBe(true);
    expect(hasUnknownResources(partial)).toBe(false);
  });
});

describe('needsNodeMetrics', () => {
  it('is true when a pool has no machine size, whatever its ready count', () => {
    expect(
      needsNodeMetrics([
        { name: 'a', readyReplicas: 1, machineSize: m5xlarge },
        { name: 'b', readyReplicas: 0, machineSize: undefined },
      ]),
    ).toBe(true);
    expect(
      needsNodeMetrics([
        { name: 'a', readyReplicas: 0, machineSize: m5xlarge },
      ]),
    ).toBe(false);
  });
});

describe('formatting', () => {
  it('uses singular and plural forms', () => {
    expect(formatWorkerNodes(1)).toBe('1 node');
    expect(formatWorkerNodes(12)).toBe('12 nodes');
    expect(formatWorkerCpu(1)).toBe('1 vCPU');
    expect(formatWorkerCpu(48)).toBe('48 vCPUs');
  });

  it('formats memory in GiB', () => {
    expect(formatWorkerMemory(192 * GIB)).toBe('192 GiB');
    expect(formatWorkerMemory(7.5 * GIB)).toBe('7.5 GiB');
  });
});
