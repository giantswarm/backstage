import { useMemo } from 'react';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useNodePoolsForAWSCluster } from '../../../../hooks';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';
import { AWSNodePoolDetails } from '../AWSNodePoolDetails';
import { AWSNodePoolsTable } from '../AWSNodePoolsTable';
import { AWSNodePoolRow } from '../AWSNodePoolsTable/columns';
import { resolveAWSNodePoolInfra } from './helpers';

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

  const data: AWSNodePoolRow[] = useMemo(() => {
    return machinePools.map(pool => {
      const { type, awsMachinePool, karpenterMachinePool } =
        resolveAWSNodePoolInfra(pool, awsMachinePools, karpenterMachinePools);

      return {
        id: pool.getName(),
        name: pool.getName(),
        type,
        desiredReplicas: pool.getDesiredReplicas(),
        readyReplicas: pool.getReadyReplicas(),
        instanceType: awsMachinePool?.getInstanceType(),
        availabilityZones: awsMachinePool?.getAvailabilityZones(),
        minSize: awsMachinePool?.getMinSize(),
        maxSize: awsMachinePool?.getMaxSize(),
        limits: karpenterMachinePool?.getLimits(),
        phase: pool.getPhase(),
        created: pool.getCreatedTimestamp(),
      };
    });
  }, [machinePools, awsMachinePools, karpenterMachinePools]);

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
      selectedNodePool={selectedNodePool}
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
