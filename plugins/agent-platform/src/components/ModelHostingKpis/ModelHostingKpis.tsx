import { useMemo } from 'react';

import {
  useClusterManagerAvailability,
  useGpuNodePools,
} from '../../hooks/useClusterManager';
import { useNodeSizePrices } from '../../hooks/useNodeSizePrices';
import { formatCount } from '../../lib/formatNumbers';
import { describeHourlyRange, totalHourlyCost } from '../../lib/poolPricing';
import { KpiTile, KpiTileGrid } from '../LlmUsage';
import { useServedModelRows } from '../ServedModelRowsProvider';
import { useServing } from '../ServingProvider';
import { cacheSize, countRunningModels, gpuUse } from './hostingKpis';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The Model hosting page's headline row, per the prototype — every tile from
 * data the page already reads, and absent where nothing reports it:
 *
 * - **Models running**: the served models that answer now (the serving
 *   layer's rows), with those starting or idle beside it.
 * - **GPUs in use**: what scheduled pods request of the accelerators the
 *   nodes advertise (the serving layer's node inventory).
 * - **GPU pools**: cluster-manager's pools and the nodes they run.
 * - **GPU cost now**: those nodes at the cloud's on-demand list price per
 *   node size, as cluster-manager lists it (`useNodeSizePrices`); a pool that
 *   may run several sizes adds its range.
 * - **Model cache**: the claims cluster-manager lists (size and monthly
 *   price), else what the backends' node caches hold.
 *
 * Must be mounted inside a ServingProvider, a ServedModelRowsProvider and the
 * plugin's QueryClientProvider.
 */
export function ModelHostingKpis() {
  const serving = useServing();
  const { rows: servedRows } = useServedModelRows();
  const availability = useClusterManagerAvailability(
    serving.reachableInstallations,
  );
  const pools = useGpuNodePools(availability.available);
  const prices = useNodeSizePrices(pools.rows);

  const running = useMemo(() => countRunningModels(servedRows), [servedRows]);
  const gpus = useMemo(() => gpuUse(serving.gpuNodes), [serving.gpuNodes]);
  const cache = useMemo(
    () => cacheSize(pools.caches, serving.gpuNodes),
    [pools.caches, serving.gpuNodes],
  );
  const hasPools = availability.available.length > 0 && pools.rows.length > 0;
  const nodesRunning = pools.rows.reduce(
    (sum, row) => sum + Math.max(0, row.pool.readyReplicas),
    0,
  );
  const poolPrices = pools.rows.map(row => prices.priceOf(row));
  const cost = totalHourlyCost(poolPrices);
  // Pools running nodes whose sizes carry no price: the total leaves them out.
  const unpricedRunning = pools.rows.filter(
    (row, index) =>
      row.pool.readyReplicas > 0 &&
      !poolPrices[index] &&
      !prices.isReading(row),
  ).length;

  if (serving.isLoading && servedRows.length === 0) {
    return null;
  }

  const runningSub = [
    running.starting > 0 && `${running.starting} starting`,
    running.idle > 0 && `${running.idle} idle`,
  ]
    .filter(Boolean)
    .join(' · ');

  let costTile: JSX.Element | null = null;
  if (hasPools && cost) {
    costTile = (
      <KpiTile
        label="GPU cost now"
        hint="What the GPU nodes running now cost per hour at the cloud's on-demand list price for their node size, as cluster-manager lists it. A pool that may run several sizes adds the range from its cheapest to its dearest."
        value={describeHourlyRange(cost.minUSD, cost.maxUSD)}
        sub={
          unpricedRunning > 0
            ? `list price · ${plural(unpricedRunning, 'pool')} without a price left out`
            : 'on-demand list price'
        }
      />
    );
  } else if (hasPools && nodesRunning === 0) {
    // Every pool scaled to zero: nothing runs, so nothing is billed by the hour.
    costTile = (
      <KpiTile
        label="GPU cost now"
        hint="GPU pools run nodes only while something is scheduled on them; none runs now."
        value="$0.00/h"
        sub="no GPU node running"
      />
    );
  } else if (hasPools && prices.isLoading) {
    costTile = (
      <KpiTile label="GPU cost now" value="…" sub="reading the list prices" />
    );
  }

  return (
    <section aria-label="Model hosting at a glance">
      <KpiTileGrid>
        <KpiTile
          label="Models running"
          hint="Served models that are loaded and answering now, on every environment in view."
          value={formatCount(running.running)}
          sub={runningSub || undefined}
        />
        {gpus && (
          <KpiTile
            label="GPUs in use"
            hint="Accelerators that scheduled pods hold, of those the nodes make schedulable."
            value={`${formatCount(gpus.used)} of ${formatCount(gpus.total)}`}
            sub={`on ${plural(gpus.nodes, 'node')}`}
          />
        )}
        {hasPools && (
          <KpiTile
            label="GPU pools"
            hint="The GPU node pools cluster-manager runs. A pool runs nodes only while something is scheduled on them."
            value={formatCount(pools.rows.length)}
            sub={`${plural(nodesRunning, 'node')} running`}
          />
        )}
        {costTile}
        {cache && (
          <KpiTile
            label="Model cache"
            hint={
              cache.basis === 'claims'
                ? 'The volumes the model weights are cached on, as cluster-manager lists them: their size, billed every month they exist.'
                : 'What the serving backends hold in their download caches on the nodes.'
            }
            value={cache.size}
            sub={
              cache.basis === 'claims'
                ? [
                    plural(cache.count, 'volume'),
                    cache.monthlyUSD !== undefined &&
                      `$${cache.monthlyUSD.toFixed(2)}/month`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : `used, ${plural(cache.count, 'cache')}`
            }
          />
        )}
      </KpiTileGrid>
    </section>
  );
}
