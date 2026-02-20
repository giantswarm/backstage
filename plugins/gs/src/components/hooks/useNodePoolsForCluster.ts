import { useMemo } from 'react';
import {
  AWSCluster,
  AWSMachinePool,
  AzureCluster,
  AzureMachineTemplate,
  KarpenterMachinePool,
  MachineDeployment,
  MachinePool,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Labels } from '@giantswarm/backstage-plugin-gs-common';
import { useCurrentCluster } from '../clusters/ClusterDetailsPage/useCurrentCluster';

export function useNodePoolsForCluster() {
  const { installationName, cluster } = useCurrentCluster();

  const clusterName = cluster.getName();
  const clusterNamespace = cluster.getNamespace();
  const infraRef = cluster.getInfrastructureRef();

  const isAWS = infraRef?.kind === AWSCluster.kind;
  const isAzure = infraRef?.kind === AzureCluster.kind;

  const labelSelectorOptions = useMemo(
    () => ({
      [installationName]: {
        namespace: clusterNamespace,
        labelSelector: {
          matchingLabels: {
            [Labels.labelClusterName]: clusterName,
          },
        },
      },
    }),
    [installationName, clusterNamespace, clusterName],
  );

  const namespaceScopedOptions = useMemo(
    () => ({
      [installationName]: {
        namespace: clusterNamespace,
      },
    }),
    [installationName, clusterNamespace],
  );

  // AWS: MachinePool (filtered by cluster label)
  const {
    resources: machinePools,
    errors: machinePoolErrors,
    isLoading: isLoadingMachinePools,
  } = useResources(
    isAWS ? [installationName] : [],
    MachinePool,
    labelSelectorOptions,
    { enabled: isAWS },
  );

  // AWS: AWSMachinePool (namespace-scoped, matched by name from MachinePool infra ref)
  const {
    resources: awsMachinePools,
    errors: awsMachinePoolErrors,
    isLoading: isLoadingAWSMachinePools,
  } = useResources(
    isAWS ? [installationName] : [],
    AWSMachinePool,
    namespaceScopedOptions,
    { enabled: isAWS },
  );

  // AWS: KarpenterMachinePool (namespace-scoped, matched by name from MachinePool infra ref)
  const {
    resources: karpenterMachinePools,
    errors: karpenterMachinePoolErrors,
    isLoading: isLoadingKarpenterMachinePools,
  } = useResources(
    isAWS ? [installationName] : [],
    KarpenterMachinePool,
    namespaceScopedOptions,
    { enabled: isAWS },
  );

  // Azure: MachineDeployment (filtered by cluster label)
  const {
    resources: machineDeployments,
    errors: machineDeploymentErrors,
    isLoading: isLoadingMachineDeployments,
  } = useResources(
    isAzure ? [installationName] : [],
    MachineDeployment,
    labelSelectorOptions,
    { enabled: isAzure },
  );

  // Azure: AzureMachineTemplate (namespace-scoped, matched by name from MachineDeployment infra ref)
  const {
    resources: azureMachineTemplates,
    errors: azureMachineTemplateErrors,
    isLoading: isLoadingAzureMachineTemplates,
  } = useResources(
    isAzure ? [installationName] : [],
    AzureMachineTemplate,
    namespaceScopedOptions,
    { enabled: isAzure },
  );

  const isLoading =
    isLoadingMachinePools ||
    isLoadingAWSMachinePools ||
    isLoadingKarpenterMachinePools ||
    isLoadingMachineDeployments ||
    isLoadingAzureMachineTemplates;

  const errors = useMemo(
    () => [
      ...machinePoolErrors,
      ...awsMachinePoolErrors,
      ...karpenterMachinePoolErrors,
      ...machineDeploymentErrors,
      ...azureMachineTemplateErrors,
    ],
    [
      machinePoolErrors,
      awsMachinePoolErrors,
      karpenterMachinePoolErrors,
      machineDeploymentErrors,
      azureMachineTemplateErrors,
    ],
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
