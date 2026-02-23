import { useMemo } from 'react';
import {
  AzureCluster,
  AzureMachineTemplate,
  Cluster,
  MachineDeployment,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Labels } from '@giantswarm/backstage-plugin-gs-common';

export function useNodePoolsForAzureCluster(cluster: Cluster) {
  const clusterName = cluster.getName();
  const clusterNamespace = cluster.getNamespace();
  const installationName = cluster.cluster;
  const infraRef = cluster.getInfrastructureRef();

  const enabled = infraRef?.kind === AzureCluster.kind;

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

  const {
    resources: machineDeployments,
    errors: machineDeploymentErrors,
    isLoading: isLoadingMachineDeployments,
  } = useResources(
    [installationName],
    MachineDeployment,
    labelSelectorOptions,
    { enabled },
  );

  const {
    resources: azureMachineTemplates,
    errors: azureMachineTemplateErrors,
    isLoading: isLoadingAzureMachineTemplates,
  } = useResources(
    [installationName],
    AzureMachineTemplate,
    namespaceScopedOptions,
    { enabled },
  );

  const isLoading =
    isLoadingMachineDeployments || isLoadingAzureMachineTemplates;

  const errors = useMemo(
    () => [...machineDeploymentErrors, ...azureMachineTemplateErrors],
    [machineDeploymentErrors, azureMachineTemplateErrors],
  );

  return {
    machineDeployments,
    azureMachineTemplates,
    isLoading,
    errors,
  };
}
