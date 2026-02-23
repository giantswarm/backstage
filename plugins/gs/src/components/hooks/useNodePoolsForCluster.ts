import { useMemo } from 'react';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useNodePoolsForAWSCluster } from './useNodePoolsForAWSCluster';
import { useNodePoolsForAzureCluster } from './useNodePoolsForAzureCluster';

export function useNodePoolsForCluster(cluster: Cluster) {
  const {
    machinePools,
    awsMachinePools,
    karpenterMachinePools,
    isLoading: isLoadingAWS,
    errors: awsErrors,
  } = useNodePoolsForAWSCluster(cluster);

  const {
    machineDeployments,
    azureMachineTemplates,
    isLoading: isLoadingAzure,
    errors: azureErrors,
  } = useNodePoolsForAzureCluster(cluster);

  const isLoading = isLoadingAWS || isLoadingAzure;

  const errors = useMemo(
    () => [...awsErrors, ...azureErrors],
    [awsErrors, azureErrors],
  );

  return {
    machinePools,
    awsMachinePools,
    karpenterMachinePools,
    machineDeployments,
    azureMachineTemplates,
    isLoading,
    errors,
  };
}
