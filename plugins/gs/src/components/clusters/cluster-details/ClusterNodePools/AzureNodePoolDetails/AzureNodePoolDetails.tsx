import {
  AzureMachineTemplate,
  MachineDeployment,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMimirNodePoolNodes } from '../../../../hooks';
import { AzureNodePoolConfiguration } from '../AzureNodePoolConfiguration';
import { NodePoolDetails } from '../NodePoolDetails';
import { NodePoolNodes } from '../NodePoolNodes';

interface AzureNodePoolDetailsProps {
  installationName: string;
  clusterName: string;
  nodePoolName: string;
  machineDeployment: MachineDeployment;
  azureMachineTemplate: AzureMachineTemplate | undefined;
  onClose: () => void;
}

export const AzureNodePoolDetails = ({
  installationName,
  clusterName,
  nodePoolName,
  machineDeployment,
  azureMachineTemplate,
  onClose,
}: AzureNodePoolDetailsProps) => {
  const { nodes, isLoading, error } = useMimirNodePoolNodes({
    installationName,
    clusterName,
    nodePoolName,
  });

  return (
    <NodePoolDetails
      nodePoolName={nodePoolName}
      nodeCount={isLoading && nodes.length === 0 ? undefined : nodes.length}
      configuration={
        <AzureNodePoolConfiguration
          machineDeployment={machineDeployment}
          azureMachineTemplate={azureMachineTemplate}
        />
      }
      nodes={
        <NodePoolNodes
          nodes={nodes}
          isLoading={isLoading}
          error={error}
          provider="azure"
        />
      }
      onClose={onClose}
    />
  );
};
