import { useMemo } from 'react';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  useMachineTypeCatalog,
  useNodePoolsForAzureCluster,
} from '../../../../hooks';
import { buildNodePoolRows, describeAzureVmSize } from '../../../nodePools';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';
import { AzureNodePoolDetails } from '../AzureNodePoolDetails';
import { AzureNodePoolsTable } from '../AzureNodePoolsTable';

export const AzureNodePools = () => {
  const { installationName, cluster } = useCurrentCluster();
  const { machineDeployments, azureMachineTemplates, isLoading, errors } =
    useNodePoolsForAzureCluster(cluster);

  useShowErrors(errors);

  const { selectedNodePool, setSelectedNodePool, clearSelectedNodePool } =
    useSelectedNodePool();

  const { catalog } = useMachineTypeCatalog('azure');

  const data = useMemo(
    () =>
      buildNodePoolRows(
        machineDeployments,
        azureMachineTemplates,
        describeAzureVmSize(catalog),
      ),
    [machineDeployments, azureMachineTemplates, catalog],
  );

  const selectedDeployment = selectedNodePool
    ? machineDeployments.find(d => d.getName() === selectedNodePool)
    : undefined;
  const selectedTemplate = data.find(
    row => row.name === selectedNodePool,
  )?.infrastructure;

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
