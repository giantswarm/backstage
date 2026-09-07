import {
  AWSMachinePool,
  KarpenterMachinePool,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  useKarpenterNodePoolStatus,
  useMimirNodePoolNodes,
} from '../../../../hooks';
import { ASGNodePoolConfiguration } from '../ASGNodePoolConfiguration';
import { NodePoolConfiguration } from '../NodePoolConfiguration';
import { NodePoolDetails } from '../NodePoolDetails';
import { NodePoolNodes } from '../NodePoolNodes';
import { type AWSNodePoolType } from '../AWSNodePools/helpers';

interface AWSNodePoolDetailsProps {
  installationName: string;
  clusterName: string;
  nodePoolName: string;
  machinePool: MachinePool;
  awsMachinePool: AWSMachinePool | undefined;
  karpenterMachinePool: KarpenterMachinePool | undefined;
  poolType: AWSNodePoolType;
  onClose: () => void;
}

/**
 * Owns both queries for the selected pool, so they are tied to the details
 * section rather than to a tab panel — an inactive `TabPanel` unmounts, which
 * would otherwise tear down and restart the polling on every tab switch.
 */
export const AWSNodePoolDetails = ({
  installationName,
  clusterName,
  nodePoolName,
  machinePool,
  awsMachinePool,
  karpenterMachinePool,
  poolType,
  onClose,
}: AWSNodePoolDetailsProps) => {
  const { nodes, isLoading, error } = useMimirNodePoolNodes({
    installationName,
    clusterName,
    nodePoolName,
  });

  // Karpenter's own metrics only exist for Karpenter pools.
  const { status } = useKarpenterNodePoolStatus({
    installationName,
    clusterName,
    nodePoolName,
    enabled: poolType === 'Karpenter',
  });

  const configuration =
    poolType === 'Karpenter' ? (
      <NodePoolConfiguration
        pool={karpenterMachinePool}
        nodePoolName={nodePoolName}
        status={status}
      />
    ) : (
      <ASGNodePoolConfiguration
        machinePool={machinePool}
        awsMachinePool={awsMachinePool}
      />
    );

  return (
    <NodePoolDetails
      nodePoolName={nodePoolName}
      nodeCount={isLoading && nodes.length === 0 ? undefined : nodes.length}
      configuration={configuration}
      nodes={
        <NodePoolNodes
          nodes={nodes}
          isLoading={isLoading}
          error={error}
          provider="aws"
        />
      }
      onClose={onClose}
    />
  );
};
