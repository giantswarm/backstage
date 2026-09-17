import { useCallback, useState } from 'react';
import { Button } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';

import {
  useClusterManagerAvailability,
  useClusterManagerInfo,
  useGpuNodePools,
  useNodePoolWrite,
  type GpuNodePoolRow,
} from '../../hooks/useClusterManager';
import type { NodePoolWriteResult } from '../../lib/clusterManager';
import type { ServedModel } from '../../lib/serving';
import { AddGpuNodePoolDialog } from './AddGpuNodePoolDialog';
import { GpuNodePoolsPanel } from './GpuNodePoolsPanel';
import type { OpenedPool } from './PoolLifecyclePanel';
import { RemoveGpuNodePoolDialog } from './RemoveGpuNodePoolDialog';

export type GpuNodePoolControls = {
  /** Some reachable installation's muster lists cluster-manager. */
  available: boolean;
  isLoading: boolean;
  /** The **Add GPU node pool** button, for the page header or an empty state. */
  addButton: JSX.Element | undefined;
  /** The Add and Remove dialogs; render once, anywhere in the page. */
  dialogs: JSX.Element | undefined;
  /** The pools list with **Remove pool**; null where cluster-manager is absent. */
  panel: JSX.Element | undefined;
};

/** The row id `useGpuNodePools` gives the pool Deploy just applied. */
export function openedPoolOf(
  installation: string,
  result: NodePoolWriteResult,
): OpenedPool {
  return {
    id: `${installation}/${result.cluster}/${result.cluster}-${result.pool}`,
    installation,
    cluster: result.cluster,
    poolName: result.pool,
    applied: result,
  };
}

/**
 * The GPU node pool controls the Models pages share (GPU capacity, Serving):
 * feature-detected per installation through the person's muster session —
 * where no reachable installation lists cluster-manager, nothing is offered.
 * Deploy closes into the pool's lifecycle panel, an accepted Remove into the
 * teardown in the same panel; a row's chevron opens it later.
 */
export function useGpuNodePoolControls(
  installations: string[],
  servedModels: ServedModel[],
): GpuNodePoolControls {
  const availability = useClusterManagerAvailability(installations);
  const pools = useGpuNodePools(availability.available);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<GpuNodePoolRow>();
  const [opened, setOpened] = useState<OpenedPool>();
  const write = useNodePoolWrite(removing?.installation);
  const { info } = useClusterManagerInfo(removing?.installation);

  const onRemove = useCallback((row: GpuNodePoolRow) => setRemoving(row), []);
  // Deploy closes into the lifecycle panel of the pool it applied.
  const onDeployed = useCallback(
    (result: NodePoolWriteResult, installation: string) => {
      setOpened(openedPoolOf(installation, result));
      setAddOpen(false);
    },
    [],
  );
  // Remove closes into the teardown: the panel shows the objects going until
  // list_node_pools no longer lists the pool.
  const onRemoved = useCallback(
    (row: GpuNodePoolRow, result: NodePoolWriteResult) =>
      setOpened({
        id: row.id,
        installation: row.installation,
        cluster: row.cluster.name,
        poolName: row.poolName,
        removed: result,
        removedAt: new Date().toISOString(),
      }),
    [],
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
  const available = availability.available.length > 0;

  return {
    available,
    isLoading: availability.isLoading,
    addButton: available ? (
      <Button
        variant="secondary"
        iconStart={<AddIcon />}
        onPress={() => setAddOpen(true)}
      >
        Add GPU node pool
      </Button>
    ) : undefined,
    dialogs: available ? (
      <>
        <AddGpuNodePoolDialog
          installations={availability.available}
          isOpen={addOpen}
          onOpenChange={setAddOpen}
          onDeployed={onDeployed}
        />
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
      </>
    ) : undefined,
    panel: available ? (
      <GpuNodePoolsPanel
        rows={pools.rows}
        isLoading={pools.isLoading}
        notes={pools.notes}
        errors={pools.errors}
        onRemove={onRemove}
        opened={opened}
        onToggleLifecycle={onToggleLifecycle}
        onCloseLifecycle={onCloseLifecycle}
      />
    ) : undefined,
  };
}
