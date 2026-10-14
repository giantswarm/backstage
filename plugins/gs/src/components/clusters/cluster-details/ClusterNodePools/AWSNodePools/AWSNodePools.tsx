import { useMemo } from 'react';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  useMachineTypeCatalog,
  useNodePoolsForAWSCluster,
} from '../../../../hooks';
import {
  buildAWSNodePoolRows,
  resolveAWSNodePoolInfra,
} from '../../../nodePools';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';
import { AWSNodePoolDetails } from '../AWSNodePoolDetails';
import { AWSNodePoolsTable } from '../AWSNodePoolsTable';

export const AWSNodePools = () => {
  const { installationName, cluster } = useCurrentCluster();
  const {
    machinePools,
    awsMachinePools,
    karpenterMachinePools,
    isLoading,
    errors,
  } = useNodePoolsForAWSCluster(cluster);

  useShowErrors(errors);

  const { selectedNodePool, setSelectedNodePool, clearSelectedNodePool } =
    useSelectedNodePool();

  const { catalog } = useMachineTypeCatalog('aws');

  const data = useMemo(
    () =>
      buildAWSNodePoolRows(
        machinePools,
        awsMachinePools,
        karpenterMachinePools,
        catalog,
      ),
    [machinePools, awsMachinePools, karpenterMachinePools, catalog],
  );

  const selected = useMemo(() => {
    if (!selectedNodePool) {
      return undefined;
    }

    const machinePool = machinePools.find(
      pool => pool.getName() === selectedNodePool,
    );
    if (!machinePool) {
      return undefined;
    }

    return {
      machinePool,
      ...resolveAWSNodePoolInfra(
        machinePool,
        awsMachinePools,
        karpenterMachinePools,
      ),
    };
  }, [selectedNodePool, machinePools, awsMachinePools, karpenterMachinePools]);

  const details =
    selectedNodePool && selected ? (
      <AWSNodePoolDetails
        installationName={installationName}
        clusterName={cluster.getName()}
        nodePoolName={selectedNodePool}
        machinePool={selected.machinePool}
        awsMachinePool={selected.awsMachinePool}
        karpenterMachinePool={selected.karpenterMachinePool}
        poolType={selected.type}
        onClose={clearSelectedNodePool}
      />
    ) : null;

  return (
    <NodePoolDetailsLayout
      // Keyed off the resolved pool, not the URL: a `?name=` pointing at a
      // since-deleted pool (or the render before the list resolves) would
      // otherwise open an empty section and scroll to it.
      selectedNodePool={selected ? selectedNodePool : null}
      details={details}
    >
      <AWSNodePoolsTable
        data={data}
        isLoading={isLoading}
        selectedNodePool={selectedNodePool ?? undefined}
        onSelectNodePool={setSelectedNodePool}
      />
    </NodePoolDetailsLayout>
  );
};
