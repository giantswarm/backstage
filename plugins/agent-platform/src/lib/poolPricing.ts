import type { InstanceShape, NodePool } from './clusterManager';

/**
 * What a GPU node pool costs per hour, from the on-demand list prices
 * cluster-manager attaches to the node sizes it composes
 * (`create_node_pool` → `sizes[].pricePerHourUSD`, giantswarm/cluster-manager#44).
 *
 * `list_node_pools` names the sizes a pool may run (`instanceTypes`) and how
 * many nodes run (`readyReplicas`), not which size each node is: Karpenter
 * picks among the sizes. A pool of one size has one price; a pool of several
 * has a range, from its cheapest priced size to its dearest.
 */
export type PoolPrice = {
  /** The cheapest and the dearest priced size the pool may run, per node and hour. */
  perNodeMinUSD: number;
  perNodeMaxUSD: number;
  /** Nodes running now. */
  nodes: number;
  /** What the running nodes cost now, per hour: `nodes` × the per-node range. */
  nowMinUSD: number;
  nowMaxUSD: number;
  /** Sizes of the pool no price is listed for (not offered in the region…). */
  unpricedSizes: string[];
  /** Where the prices were read, with their date. */
  source?: string;
};

/** Whether a pool's instance type names this size: `g6.xlarge`, or the size alone. */
function isSizeOf(instanceType: string, shape: InstanceShape): boolean {
  return instanceType === shape.instanceType || instanceType === shape.size;
}

/**
 * The pool's price from the sizes cluster-manager priced for its cluster and
 * accelerator; `undefined` when none of its sizes carries a price.
 */
export function poolPriceOf(
  pool: Pick<NodePool, 'instanceTypes' | 'readyReplicas'>,
  shapes: InstanceShape[],
): PoolPrice | undefined {
  const priced = shapes.filter(
    shape =>
      shape.pricePerHourUSD !== undefined &&
      pool.instanceTypes.some(type => isSizeOf(type, shape)),
  );
  if (priced.length === 0) {
    return undefined;
  }
  const prices = priced.map(shape => shape.pricePerHourUSD!);
  const perNodeMinUSD = Math.min(...prices);
  const perNodeMaxUSD = Math.max(...prices);
  const nodes = Math.max(0, pool.readyReplicas);
  const sourced = priced.find(shape => shape.priceSource);
  return {
    perNodeMinUSD,
    perNodeMaxUSD,
    nodes,
    nowMinUSD: nodes * perNodeMinUSD,
    nowMaxUSD: nodes * perNodeMaxUSD,
    unpricedSizes: pool.instanceTypes.filter(
      type => !priced.some(shape => isSizeOf(type, shape)),
    ),
    source: sourced
      ? `${sourced.priceSource}${sourced.priceAsOf ? `, as of ${sourced.priceAsOf}` : ''}`
      : undefined,
  };
}

/** `$1.01/h`, or `$1.01–1.22/h` for a range. */
export function describeHourlyRange(minUSD: number, maxUSD: number): string {
  const min = minUSD.toFixed(2);
  const max = maxUSD.toFixed(2);
  return min === max ? `$${min}/h` : `$${min}–${max}/h`;
}

/** The pools' running nodes together, per hour; `undefined` when no pool is priced. */
export function totalHourlyCost(
  prices: (PoolPrice | undefined)[],
): { minUSD: number; maxUSD: number } | undefined {
  const priced = prices.filter((price): price is PoolPrice => Boolean(price));
  if (priced.length === 0) {
    return undefined;
  }
  return {
    minUSD: priced.reduce((sum, price) => sum + price.nowMinUSD, 0),
    maxUSD: priced.reduce((sum, price) => sum + price.nowMaxUSD, 0),
  };
}
