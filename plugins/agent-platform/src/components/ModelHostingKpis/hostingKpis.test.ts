import type { ModelCacheRow } from '../../hooks/useClusterManager';
import type { GpuNode } from '../../lib/serving';
import { cacheSize, countRunningModels, gpuUse } from './hostingKpis';

const node = (overrides: Partial<GpuNode>): GpuNode => ({
  id: overrides.name ?? 'node',
  installation: 'inst-1',
  name: 'node',
  ready: true,
  ...overrides,
});

describe('countRunningModels', () => {
  it('counts the answering models, and those starting, pending or idle apart', () => {
    expect(
      countRunningModels([
        { readiness: 'ready' },
        { readiness: 'ready' },
        { readiness: 'starting' },
        { readiness: 'pending' },
        { readiness: 'idle' },
        { readiness: 'notServing' },
        { readiness: 'ready', kind: 'download' },
      ]),
    ).toEqual({ running: 2, starting: 1, pending: 1, idle: 1 });
  });
});

describe('gpuUse', () => {
  it('adds up what pods hold of the accelerators the nodes advertise', () => {
    expect(
      gpuUse([
        node({
          name: 'a',
          resource: 'nvidia.com/gpu',
          capacity: 4,
          allocatable: 4,
          requested: 3,
        }),
        node({
          name: 'b',
          resource: 'nvidia.com/gpu',
          capacity: 4,
          allocatable: 4,
        }),
        // A backend host reports memory, not GPUs.
        node({ name: 'ollama-host', memoryBudgetBytes: 64 * 1024 ** 3 }),
      ]),
    ).toEqual({ used: 3, total: 8, nodes: 2 });
  });

  it('is absent when no node advertises an accelerator', () => {
    expect(gpuUse([node({ name: 'ollama-host' })])).toBeUndefined();
    expect(gpuUse([])).toBeUndefined();
  });
});

const claim = (
  name: string,
  capacityGiB?: number,
  monthlyUSD?: number,
): ModelCacheRow =>
  ({
    id: `inst-1/wc1/${name}`,
    installation: 'inst-1',
    claim: {
      namespace: 'model-serving',
      name,
      capacityGiB,
      ...(monthlyUSD === undefined
        ? {}
        : { price: { monthlyUSD, source: 'AWS EBS', asOf: '2026-09-19' } }),
    },
  }) as ModelCacheRow;

describe('cacheSize', () => {
  it("sums cluster-manager's claims and their monthly price", () => {
    expect(
      cacheSize([claim('hf-cache', 100, 8), claim('hf-cache-b', 112)], []),
    ).toEqual({ size: '212 GiB', monthlyUSD: 8, count: 2, basis: 'claims' });
  });

  it('words a large cache in TiB', () => {
    expect(cacheSize([claim('hf-cache', 1536)], [])?.size).toBe('1.5 TiB');
  });

  it("falls back to the backends' node caches, a shared one counted once", () => {
    const shared = {
      claim: 'hf-cache',
      shared: true,
      bytesUsed: 10 * 1024 ** 3,
    };
    expect(
      cacheSize(
        [],
        [
          node({ id: 'a', name: 'a', cache: shared }),
          node({ id: 'b', name: 'b', cache: shared }),
          node({ id: 'c', name: 'c', cache: { bytesUsed: 2 * 1024 ** 3 } }),
        ],
      ),
    ).toEqual({
      size: '12 GiB',
      monthlyUSD: undefined,
      count: 2,
      basis: 'nodes',
    });
  });

  it('is absent when nothing reports a cache', () => {
    expect(cacheSize([], [node({})])).toBeUndefined();
  });
});
