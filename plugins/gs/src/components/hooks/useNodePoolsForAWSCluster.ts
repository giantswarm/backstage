import { useMemo } from 'react';
import {
  AWSCluster,
  AWSMachinePool,
  Cluster,
  KarpenterMachinePool,
  MachinePool,
  isNotFoundError,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Labels } from '@giantswarm/backstage-plugin-gs-common';

export function useNodePoolsForAWSCluster(cluster: Cluster) {
  const clusterName = cluster.getName();
  const clusterNamespace = cluster.getNamespace();
  const installationName = cluster.cluster;
  const infraRef = cluster.getInfrastructureRef();

  const enabled = infraRef?.kind === AWSCluster.kind;

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
    resources: machinePools,
    errors: machinePoolErrors,
    isLoading: isLoadingMachinePools,
  } = useResources([installationName], MachinePool, labelSelectorOptions, {
    enabled,
  });

  const {
    resources: awsMachinePools,
    errors: awsMachinePoolErrors,
    isLoading: isLoadingAWSMachinePools,
  } = useResources([installationName], AWSMachinePool, namespaceScopedOptions, {
    enabled,
  });

  const {
    resources: karpenterMachinePools,
    errors: karpenterMachinePoolErrors,
    isLoading: isLoadingKarpenterMachinePools,
  } = useResources(
    [installationName],
    KarpenterMachinePool,
    namespaceScopedOptions,
    { enabled },
  );

  const isLoading =
    isLoadingMachinePools ||
    isLoadingAWSMachinePools ||
    isLoadingKarpenterMachinePools;

  const errors = useMemo(
    () => [
      ...machinePoolErrors,
      ...awsMachinePoolErrors,
      // Not every AWS installation serves the Karpenter CRD. That is a
      // legitimate installation shape, not a fault worth showing the user, so
      // a 404 here is dropped rather than raised as an error banner.
      ...karpenterMachinePoolErrors.filter(error => !isNotFoundError(error)),
    ],
    [machinePoolErrors, awsMachinePoolErrors, karpenterMachinePoolErrors],
  );

  return {
    machinePools,
    awsMachinePools,
    karpenterMachinePools,
    isLoading,
    errors,
  };
}
