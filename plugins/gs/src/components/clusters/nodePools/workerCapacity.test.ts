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
    const metrics = new Map([
      ['karpenter', { nodes: 4, vcpus: 16, memoryBytes: 64 * GIB }],
    ]);

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
        new Map(),
      ),
    ).toEqual({
      nodes: 3,
      vcpus: 4,
      memoryBytes: 16 * GIB,
      uncountedPools: ['aks'],
    });
  });

  it('needs no size for a pool without ready nodes', () => {
    const pools = [
      { name: 'empty', readyReplicas: 0, machineSize: undefined },
      { name: 'new', readyReplicas: undefined, machineSize: undefined },
    ];

    expect(needsNodeMetrics(pools)).toBe(false);
    expect(computeWorkerCapacity(pools)).toEqual({
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
      new Map(),
    );
    const partial = computeWorkerCapacity(
      [
        { name: 'a', readyReplicas: 1, machineSize: m5xlarge },
        { name: 'vcd', readyReplicas: 3, machineSize: undefined },
      ],
      new Map(),
    );

    expect(hasUnknownResources(unknown)).toBe(true);
    expect(hasUnknownResources(partial)).toBe(false);
  });
});

describe('needsNodeMetrics', () => {
  it('is true when a pool with ready nodes has no machine size', () => {
    expect(
      needsNodeMetrics([
        { name: 'a', readyReplicas: 1, machineSize: m5xlarge },
        { name: 'b', readyReplicas: 1, machineSize: undefined },
      ]),
    ).toBe(true);
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
