import { useMemo } from 'react';
import {
  AWSMachinePool,
  KarpenterMachinePool,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useNodePoolsForAWSCluster } from '../../../../hooks';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';
import { NodePoolNodes } from '../NodePoolNodes';
import { AWSNodePoolsTable } from '../AWSNodePoolsTable';
import { AWSNodePoolRow } from '../AWSNodePoolsTable/columns';

export const AWSNodePools = () => {
  const { installationName, cluster } = useCurrentCluster();
  const { machinePools, awsMachinePools, isLoading, errors } =
    useNodePoolsForAWSCluster(cluster);

  useShowErrors(errors);

  const { selectedNodePool, setSelectedNodePool, clearSelectedNodePool } =
    useSelectedNodePool();

  const data: AWSNodePoolRow[] = useMemo(() => {
    return machinePools.map(pool => {
      const infraRef = pool.getInfrastructureRef();
      const infraKind = infraRef?.kind;
      const infraName = infraRef?.name;

      let type: 'ASG' | 'Karpenter' = 'ASG';
      let instanceType: string | undefined;
      let availabilityZones: string[] | undefined;
      let minSize: number | undefined;
      let maxSize: number | undefined;

      if (infraKind === KarpenterMachinePool.kind && infraName) {
        type = 'Karpenter';
      } else if (infraKind === AWSMachinePool.kind && infraName) {
        const awsPool = awsMachinePools.find(p => p.getName() === infraName);
        if (awsPool) {
          instanceType = awsPool.getInstanceType();
          availabilityZones = awsPool.getAvailabilityZones();
          minSize = awsPool.getMinSize();
          maxSize = awsPool.getMaxSize();
        }
      }

      return {
        id: pool.getName(),
        name: pool.getName(),
        type,
        desiredReplicas: pool.getDesiredReplicas(),
        readyReplicas: pool.getReadyReplicas(),
        instanceType,
        availabilityZones,
        minSize,
        maxSize,
        phase: pool.getPhase(),
        created: pool.getCreatedTimestamp(),
      };
    });
  }, [machinePools, awsMachinePools]);

  const details = selectedNodePool ? (
    <NodePoolNodes
      installationName={installationName}
      clusterName={cluster.getName()}
      nodePoolName={selectedNodePool}
      provider="aws"
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
