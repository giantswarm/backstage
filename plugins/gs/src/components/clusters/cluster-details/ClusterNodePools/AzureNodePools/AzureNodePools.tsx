import { useMemo } from 'react';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useNodePoolsForAzureCluster } from '../../../../hooks';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';
import { AzureNodePoolDetails } from '../AzureNodePoolDetails';
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
      const infraName = deployment.getInfrastructureRef()?.name;
      const template = infraName
        ? azureMachineTemplates.find(t => t.getName() === infraName)
        : undefined;

      return {
        id: deployment.getName(),
        name: deployment.getName(),
        desiredReplicas: deployment.getDesiredReplicas(),
        readyReplicas: deployment.getReadyReplicas(),
        vmSize: template?.getVmSize(),
        phase: deployment.getPhase(),
        created: deployment.getCreatedTimestamp(),
      };
    });
  }, [machineDeployments, azureMachineTemplates]);

  const selectedDeployment = selectedNodePool
    ? machineDeployments.find(d => d.getName() === selectedNodePool)
    : undefined;

  const selectedInfraName = selectedDeployment?.getInfrastructureRef()?.name;
  const selectedTemplate = selectedInfraName
    ? azureMachineTemplates.find(t => t.getName() === selectedInfraName)
    : undefined;

  const details =
    selectedNodePool && selectedDeployment ? (
      <AzureNodePoolDetails
        installationName={installationName}
        clusterName={cluster.getName()}
        nodePoolName={selectedNodePool}
        machineDeployment={selectedDeployment}
        azureMachineTemplate={selectedTemplate}
        onClose={clearSelectedNodePool}
      />
    ) : null;

  return (
    <NodePoolDetailsLayout
      // See AWSNodePools: keyed off the resolved deployment, not the URL.
      selectedNodePool={selectedDeployment ? selectedNodePool : null}
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
