import {
  AWSCluster,
  AzureASOManagedCluster,
  AzureCluster,
  Cluster,
  useResources,
  VCDCluster,
  VSphereCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMemo } from 'react';
import { installationsByInfraKind } from '../utils/installationsByInfraKind';

export function useProviderClustersForClusters(
  clusterResources: Cluster[],
  { enabled = true },
) {
  const byKind = installationsByInfraKind(clusterResources);
  const awsInstallations = byKind[AWSCluster.kind] ?? [];
  const azureInstallations = byKind[AzureCluster.kind] ?? [];
  const azureManagedInstallations = byKind[AzureASOManagedCluster.kind] ?? [];
  const vSphereInstallations = byKind[VSphereCluster.kind] ?? [];
  const vCDInstallations = byKind[VCDCluster.kind] ?? [];

  const {
    resources: awsClusters,
    errors: awsClusterErrors,
    isLoading: isLoadingAWSClusters,
  } = useResources(
    awsInstallations,
    AWSCluster,
    {},
    { enabled: enabled && awsInstallations.length > 0 },
  );

  const {
    resources: azureClusters,
    errors: azureClusterErrors,
    isLoading: isLoadingAzureClusters,
  } = useResources(
    azureInstallations,
    AzureCluster,
    {},
    { enabled: enabled && azureInstallations.length > 0 },
  );

  const {
    resources: azureManagedClusters,
    errors: azureManagedClusterErrors,
    isLoading: isLoadingAzureManagedClusters,
  } = useResources(
    azureManagedInstallations,
    AzureASOManagedCluster,
    {},
    { enabled: enabled && azureManagedInstallations.length > 0 },
  );

  const {
    resources: vSphereClusters,
    errors: vSphereClusterErrors,
    isLoading: isLoadingVSphereClusters,
  } = useResources(
    vSphereInstallations,
    VSphereCluster,
    {},
    { enabled: enabled && vSphereInstallations.length > 0 },
  );

  const {
    resources: vCDClusters,
    errors: vCDClusterErrors,
    isLoading: isLoadingVCDClusters,
  } = useResources(
    vCDInstallations,
    VCDCluster,
    {},
    { enabled: enabled && vCDInstallations.length > 0 },
  );

  return useMemo(() => {
    return {
      resources: [
        ...awsClusters,
        ...azureClusters,
        ...azureManagedClusters,
        ...vSphereClusters,
        ...vCDClusters,
      ],
      errors: [
        ...awsClusterErrors,
        ...azureClusterErrors,
        ...azureManagedClusterErrors,
        ...vSphereClusterErrors,
        ...vCDClusterErrors,
      ],
      isLoading:
        isLoadingAWSClusters ||
        isLoadingAzureClusters ||
        isLoadingAzureManagedClusters ||
        isLoadingVSphereClusters ||
        isLoadingVCDClusters,
    };
  }, [
    awsClusters,
    azureClusters,
    azureManagedClusters,
    vSphereClusters,
    vCDClusters,
    awsClusterErrors,
    azureClusterErrors,
    azureManagedClusterErrors,
    vSphereClusterErrors,
    vCDClusterErrors,
    isLoadingAWSClusters,
    isLoadingAzureClusters,
    isLoadingAzureManagedClusters,
    isLoadingVSphereClusters,
    isLoadingVCDClusters,
  ]);
}
