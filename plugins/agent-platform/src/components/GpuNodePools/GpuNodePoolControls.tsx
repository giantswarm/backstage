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
import type { ServedModel } from '../../lib/serving';
import { AddGpuNodePoolDialog } from './AddGpuNodePoolDialog';
import { GpuNodePoolsPanel } from './GpuNodePoolsPanel';
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

/**
 * The GPU node pool controls the Models pages share (GPU capacity, Serving):
 * feature-detected per installation through the person's muster session —
 * where no reachable installation lists cluster-manager, nothing is offered.
 */
export function useGpuNodePoolControls(
  installations: string[],
  servedModels: ServedModel[],
): GpuNodePoolControls {
  const availability = useClusterManagerAvailability(installations);
  const pools = useGpuNodePools(availability.available);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<GpuNodePoolRow>();
  const write = useNodePoolWrite(removing?.installation);
  const { info } = useClusterManagerInfo(removing?.installation);

  const onRemove = useCallback((row: GpuNodePoolRow) => setRemoving(row), []);
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
        />
      </>
    ) : undefined,
    panel: available ? (
      <GpuNodePoolsPanel
        rows={pools.rows}
        isLoading={pools.isLoading}
        errors={pools.errors}
        onRemove={onRemove}
      />
    ) : undefined,
  };
}
