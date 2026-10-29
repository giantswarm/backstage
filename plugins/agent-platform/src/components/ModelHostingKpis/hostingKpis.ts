import type { ModelCacheRow } from '../../hooks/useClusterManager';
import type { GpuNode, ServedModelReadiness } from '../../lib/serving';

/**
 * How many served models answer now, and how many are on their way — counted
 * by the Running models table's states, so the tile and the rows use the same
 * words (UX review M14).
 */
export type RunningModels = {
  /** Loaded and answering. */
  running: number;
  /** Placed and loading (`starting`). */
  starting: number;
  /** No verdict from the backend yet, e.g. unschedulable (`pending`). */
  pending: number;
  /** Listed, loads on its first request. */
  idle: number;
};

export function countRunningModels(
  rows: { readiness: ServedModelReadiness; kind?: string }[],
): RunningModels {
  const counts: RunningModels = {
    running: 0,
    starting: 0,
    pending: 0,
    idle: 0,
  };
  for (const row of rows) {
    if (row.kind === 'download') {
      continue;
    }
    if (row.readiness === 'ready') {
      counts.running += 1;
    } else if (row.readiness === 'starting') {
      counts.starting += 1;
    } else if (row.readiness === 'pending') {
      counts.pending += 1;
    } else if (row.readiness === 'idle') {
      counts.idle += 1;
    }
  }
  return counts;
}

/** The accelerators the device plugins advertise, and how many pods hold. */
export type GpuUse = {
  used: number;
  total: number;
  /** Nodes that advertise accelerators. */
  nodes: number;
};

/**
 * GPUs in use across the nodes that advertise an accelerator resource:
 * what scheduled pods request of what is allocatable. A host that only
 * reports its memory (an Ollama host) counts no GPUs; `undefined` when no
 * node advertises any.
 */
export function gpuUse(nodes: GpuNode[]): GpuUse | undefined {
  const counted = nodes.filter(
    node => node.resource !== undefined && node.capacity !== undefined,
  );
  if (counted.length === 0) {
    return undefined;
  }
  return {
    used: counted.reduce((sum, node) => sum + (node.requested ?? 0), 0),
    total: counted.reduce(
      (sum, node) => sum + (node.allocatable ?? node.capacity ?? 0),
      0,
    ),
    nodes: counted.length,
  };
}

/** The model cache as the page states it: its size, and what it is billed. */
export type CacheSize = {
  /** `212 GiB`, `1.5 TiB`. */
  size: string;
  /** Monthly list price of the priced claims; `undefined` when none is priced. */
  monthlyUSD: number | undefined;
  /** Volumes or node caches the size adds up. */
  count: number;
  /** `claims`: the volumes cluster-manager lists (their size, billed); `nodes`: what a backend's node caches hold. */
  basis: 'claims' | 'nodes';
};

function describeGiB(gib: number): string {
  if (gib >= 1024) {
    return `${Number((gib / 1024).toFixed(1))} TiB`;
  }
  return `${Number(gib.toFixed(gib < 10 ? 1 : 0))} GiB`;
}

/**
 * The model cache: the claims cluster-manager lists (their provisioned size,
 * what is billed), else what the serving backends' node caches hold;
 * `undefined` when neither reports one.
 */
export function cacheSize(
  claims: ModelCacheRow[],
  nodes: GpuNode[],
): CacheSize | undefined {
  const sized = claims.filter(row => row.claim.capacityGiB !== undefined);
  if (sized.length > 0) {
    const priced = claims.filter(row => row.claim.price !== undefined);
    return {
      size: describeGiB(
        sized.reduce((sum, row) => sum + row.claim.capacityGiB!, 0),
      ),
      monthlyUSD:
        priced.length > 0
          ? priced.reduce((sum, row) => sum + row.claim.price!.monthlyUSD, 0)
          : undefined,
      count: sized.length,
      basis: 'claims',
    };
  }
  const caches = nodes.filter(node => node.cache?.bytesUsed !== undefined);
  if (caches.length > 0) {
    // A shared cache (network storage every node sees) is one cache, listed
    // on every node: counted once per claim.
    const seen = new Set<string>();
    let bytes = 0;
    for (const node of caches) {
      const key = node.cache?.shared
        ? `${node.installation}/${node.cache.claim ?? ''}`
        : node.id;
      if (!seen.has(key)) {
        seen.add(key);
        bytes += node.cache!.bytesUsed!;
      }
    }
    return {
      size: describeGiB(bytes / 1024 ** 3),
      monthlyUSD: undefined,
      count: seen.size,
      basis: 'nodes',
    };
  }
  return undefined;
}
