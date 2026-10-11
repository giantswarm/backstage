import { useCallback, useMemo, useState } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import type { InstallationScope } from '@giantswarm/backstage-plugin-gs';

import {
  useClusterManagerAvailability,
  useClusterManagerInfo,
  useGpuNodePools,
  useInstallationsOffering,
  useNodePoolWrite,
  type GpuNodePoolRow,
  type ModelCacheRow,
} from '../../hooks/useClusterManager';
import {
  useHostingFlowOutcome,
  useOpenHostingFlow,
} from '../../hooks/useHostingFlow';
import { useNodeSizePrices } from '../../hooks/useNodeSizePrices';
import { useServeIntentRunner } from '../../hooks/useServeIntentRunner';
import { useServeIntents } from '../../hooks/useServeIntents';
import {
  CLUSTER_MANAGER_TOOLS,
  type NodePoolWriteResult,
} from '../../lib/clusterManager';
import { addGpuNodePoolRouteRef } from '../../routes';
import { poolIdOf, servedModelOf } from '../../lib/serveIntent';
import type { ServedModel } from '../../lib/serving';
import {
  HIDE_INSTALLATION,
  isSoleInstallation,
} from '../../lib/soleInstallation';
import { GpuNodePoolsPanel } from './GpuNodePoolsPanel';
import { ModelCachePanel } from './ModelCachePanel';
import type { OpenedPool, PoolServeState } from './PoolLifecyclePanel';
import { RemoveGpuNodePoolDialog } from './RemoveGpuNodePoolDialog';
import { RemoveModelCacheDialog } from './RemoveModelCacheDialog';

export type GpuNodePoolControls = {
  /** Some reachable installation's muster lists cluster-manager. */
  available: boolean;
  isLoading: boolean;
  /** The **Add GPU node pool** button, for an empty state. */
  addButton: JSX.Element | undefined;
  /**
   * **Add GPU node pool** as a page header's action (`ModelHostingActions`):
   * offered while the installations are read too, disabled until one lists
   * cluster-manager; `undefined` where none does. Opens the flow's page.
   */
  addAction: { open: () => void; isDisabled: boolean } | undefined;
  /** The Remove dialogs (pool, cache); render once, anywhere in the page. */
  dialogs: JSX.Element | undefined;
  /** The pools list with **Remove pool**; null where cluster-manager is absent. */
  panel: JSX.Element | undefined;
  /**
   * The Model cache card: the claims of every cluster cluster-manager lists
   * with their size, price and since when, and **Remove cache**
   * (giantswarm/backstage#2493); null where cluster-manager is absent.
   */
  cachePanel: JSX.Element | undefined;
};

/**
 * The router-state key under which Add GPU node pool hands the pool it
 * deployed to the GPU pools view, which opens the pool's lifecycle panel on
 * it (`useHostingFlowOutcome`).
 */
export const OPENED_POOL_KEY = 'openedPool';

/** An {@link OpenedPool} as the router state carries it, or `undefined`. */
function parseOpenedPool(value: unknown): OpenedPool | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const pool = value as Partial<OpenedPool>;
  return typeof pool.id === 'string' &&
    typeof pool.installation === 'string' &&
    typeof pool.cluster === 'string' &&
    typeof pool.poolName === 'string'
    ? (pool as OpenedPool)
    : undefined;
}

/** The row id `useGpuNodePools` gives the pool Deploy just applied. */
export function openedPoolOf(
  installation: string,
  result: NodePoolWriteResult,
): OpenedPool {
  const pool = {
    installation,
    cluster: result.cluster,
    poolName: result.pool,
  };
  return { id: poolIdOf(pool), ...pool, applied: result };
}

/**
 * The GPU node pool controls the Models pages share (GPU capacity, Serving):
 * feature-detected per installation through the person's muster session —
 * where no reachable installation lists cluster-manager, nothing is offered.
 * **Add GPU node pool** opens its own page (`AddGpuNodePoolPage`), whose
 * Deploy lands back here on the pool's lifecycle panel ({@link
 * OPENED_POOL_KEY}); an accepted Remove opens the teardown in the same panel;
 * a row's chevron opens it later. A preset chosen on the Add form is the
 * pool's serve intent: kept per pool in the browser and served through
 * model-manager as the person once the pool's stack is ready
 * (`useServeIntentRunner`), shown as the panel's last step; Remove clears it.
 */
export function useGpuNodePoolControls(
  installations: string[],
  servedModels: ServedModel[],
  scope: InstallationScope,
): GpuNodePoolControls {
  const availability = useClusterManagerAvailability(installations);
  const pools = useGpuNodePools(availability.available);
  // What each pool's nodes cost per hour, from cluster-manager's list prices.
  const prices = useNodeSizePrices(pools.rows);
  const [removing, setRemoving] = useState<GpuNodePoolRow>();
  const [removingCache, setRemovingCache] = useState<ModelCacheRow>();
  const deployed = useHostingFlowOutcome(OPENED_POOL_KEY, parseOpenedPool);
  const [opened, setOpened] = useState<OpenedPool | undefined>(deployed);
  const write = useNodePoolWrite(removing?.installation);
  const cacheWrite = useNodePoolWrite(removingCache?.installation);
  const { info } = useClusterManagerInfo(removing?.installation);
  // Remove cache is offered where the installation's cluster-manager has the
  // tool; an older one shows its claims read-only.
  const cacheRemovable = useInstallationsOffering(
    availability.available,
    CLUSTER_MANAGER_TOOLS.removeModelCache,
  );
  const intents = useServeIntents();
  const settledInstallations = useMemo(
    () =>
      pools.isLoading
        ? []
        : availability.available.filter(
            installation =>
              !pools.errors.some(entry => entry.installation === installation),
          ),
    [pools.isLoading, pools.errors, availability.available],
  );
  const runner = useServeIntentRunner({
    store: intents,
    rows: pools.rows,
    servedModels,
    settledInstallations,
  });

  const onRemove = useCallback((row: GpuNodePoolRow) => setRemoving(row), []);
  const onRemoveCache = useCallback(
    (row: ModelCacheRow) => setRemovingCache(row),
    [],
  );
  // Remove closes into the teardown: the panel shows the objects going until
  // list_node_pools no longer lists the pool. The intent goes with the pool.
  const onRemoved = useCallback(
    (row: GpuNodePoolRow, result: NodePoolWriteResult) => {
      intents.remove([row.id]);
      setOpened({
        id: row.id,
        installation: row.installation,
        cluster: row.cluster.name,
        poolName: row.poolName,
        removed: result,
        removedAt: new Date().toISOString(),
      });
    },
    [intents],
  );
  const onToggleLifecycle = useCallback(
    (row: GpuNodePoolRow) =>
      setOpened(current =>
        current?.id === row.id
          ? undefined
          : {
              id: row.id,
              installation: row.installation,
              cluster: row.cluster.name,
              poolName: row.poolName,
            },
      ),
    [],
  );
  const onCloseLifecycle = useCallback(() => setOpened(undefined), []);
  const openFlow = useOpenHostingFlow();
  const addPoolRoute = useRouteRef(addGpuNodePoolRouteRef);
  const openAdd = useCallback(() => {
    if (addPoolRoute) {
      openFlow(addPoolRoute());
    }
  }, [openFlow, addPoolRoute]);
  const available = availability.available.length > 0;
  // While the installations' server lists are read the cards and the button
  // are in place already, their contents reading: nothing appears later
  // and moves the page (giantswarm/backstage#2501).
  const shown = available || availability.isLoading;
  const reading = availability.isLoading || pools.isLoading;
  // An installation whose cluster-manager serves no Cluster API can hold no
  // pool or cache claim, so it does not count towards showing the column.
  const hideColumns = isSoleInstallation({
    scope,
    isLoading: reading,
    installations: availability.available.filter(
      installation =>
        !pools.notes.some(entry => entry.installation === installation),
    ),
    unreachableInstallations: pools.errors.map(entry => entry.installation),
  })
    ? HIDE_INSTALLATION
    : undefined;

  const addAction = useMemo(
    () => (shown ? { open: openAdd, isDisabled: !available } : undefined),
    [shown, openAdd, available],
  );

  // The opened pool's intent, as the panel shows it.
  const serve = useMemo<PoolServeState | undefined>(() => {
    const intent = opened ? intents.intentOf(opened.id) : undefined;
    if (!opened || !intent) {
      return undefined;
    }
    return {
      intent,
      model: servedModelOf(intent, servedModels),
      loading: runner.isServing(opened.id),
      onRetry: () => runner.retry(opened.id),
    };
  }, [opened, intents, servedModels, runner]);

  return {
    available,
    isLoading: availability.isLoading,
    addButton: shown ? (
      <Button
        variant="secondary"
        iconStart={<AddIcon />}
        onPress={openAdd}
        isDisabled={!available}
      >
        Add GPU node pool
      </Button>
    ) : undefined,
    addAction,
    dialogs: available ? (
      <>
        <RemoveGpuNodePoolDialog
          row={removing}
          isOpen={Boolean(removing)}
          onOpenChange={open => {
            if (!open) {
              setRemoving(undefined);
            }
          }}
          write={write}
          servedModels={servedModels}
          canCommit={info?.modes.commit === true}
          onRemoved={result => {
            if (removing) {
              onRemoved(removing, result);
            }
          }}
        />
        <RemoveModelCacheDialog
          row={removingCache}
          isOpen={Boolean(removingCache)}
          onOpenChange={open => {
            if (!open) {
              setRemovingCache(undefined);
            }
          }}
          write={cacheWrite}
          servedModels={servedModels}
        />
      </>
    ) : undefined,
    panel: shown ? (
      <GpuNodePoolsPanel
        rows={pools.rows}
        isLoading={reading}
        notes={pools.notes}
        errors={pools.errors}
        onRemove={onRemove}
        opened={opened}
        serve={serve}
        onToggleLifecycle={onToggleLifecycle}
        onCloseLifecycle={onCloseLifecycle}
        hideColumns={hideColumns}
        prices={prices}
      />
    ) : undefined,
    cachePanel: shown ? (
      <ModelCachePanel
        rows={pools.caches}
        isLoading={reading}
        removable={cacheRemovable}
        onRemove={onRemoveCache}
        hideColumns={hideColumns}
      />
    ) : undefined,
  };
}
