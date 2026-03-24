import { useMemo } from 'react';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useNodePoolsForAzureCluster } from '../../../../hooks';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';
import { NodePoolNodes } from '../NodePoolNodes';
import { AzureNodePoolsTable } from '../AzureNodePoolsTable';
import { AzureNodePoolRow } from '../AzureNodePoolsTable/columns';

export const AzureNodePools = () => {
  const { installationName, cluster } = useCurrentCluster();
  const { machineDeployments, azureMachineTemplates, isLoading, errors } =
    useNodePoolsForAzureCluster(cluster);

  useShowErrors(errors);

  const { selectedNodePool, setSelectedNodePool, clearSelectedNodePool } =
    useSelectedNodePool();

  const data: AzureNodePoolRow[] = useMemo(() => {
    return machineDeployments.map(deployment => {
      const infraRef = deployment.getInfrastructureRef();
      const infraName = infraRef?.name;

      let vmSize: string | undefined;

      if (infraName) {
        const template = azureMachineTemplates.find(
          t => t.getName() === infraName,
        );
        if (template) {
          vmSize = template.getVmSize();
        }
      }

      return {
        id: deployment.getName(),
        name: deployment.getName(),
        desiredReplicas: deployment.getDesiredReplicas(),
        readyReplicas: deployment.getReadyReplicas(),
        vmSize,
        phase: deployment.getPhase(),
        created: deployment.getCreatedTimestamp(),
      };
    });
  }, [machineDeployments, azureMachineTemplates]);

  const details = selectedNodePool ? (
    <NodePoolNodes
      installationName={installationName}
      clusterName={cluster.getName()}
      nodePoolName={selectedNodePool}
      provider="azure"
      onClose={clearSelectedNodePool}
    />
  ) : null;

  return (
    <NodePoolDetailsLayout
      selectedNodePool={selectedNodePool}
      details={details}
    >
      <AzureNodePoolsTable
        data={data}
        isLoading={isLoading}
        selectedNodePool={selectedNodePool ?? undefined}
        onSelectNodePool={setSelectedNodePool}
      />
    </NodePoolDetailsLayout>
  );
};
