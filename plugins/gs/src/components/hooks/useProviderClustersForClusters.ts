import {
  AWSCluster,
  AzureCluster,
  Cluster,
  useResources,
  VCDCluster,
  VSphereCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMemo } from 'react';

export function useProviderClustersForClusters(
  clusterResources: Cluster[],
  { enabled = true },
) {
  const awsInstallations = new Set<string>();
  const azureInstallations = new Set<string>();
  const vSphereInstallations = new Set<string>();
  const vCDInstallations = new Set<string>();
  clusterResources.forEach(cluster => {
    const infrastructureRef = cluster.getInfrastructureRef();

    if (!infrastructureRef) {
      return;
    }

    if (infrastructureRef.kind === AWSCluster.kind) {
      awsInstallations.add(cluster.cluster);
    }

    if (infrastructureRef.kind === AzureCluster.kind) {
      azureInstallations.add(cluster.cluster);
    }

    if (infrastructureRef.kind === VSphereCluster.kind) {
      vSphereInstallations.add(cluster.cluster);
    }

    if (infrastructureRef.kind === VCDCluster.kind) {
      vCDInstallations.add(cluster.cluster);
    }
  });

  const {
    resources: awsClusters,
    errors: awsClusterErrors,
    isLoading: isLoadingAWSClusters,
  } = useResources(
    Array.from(awsInstallations),
    AWSCluster,
    {},
    { enabled: enabled && awsInstallations.size > 0 },
  );

  const {
    resources: azureClusters,
    errors: azureClusterErrors,
    isLoading: isLoadingAzureClusters,
  } = useResources(
    Array.from(azureInstallations),
    AzureCluster,
    {},
    { enabled: enabled && azureInstallations.size > 0 },
  );

  const {
    resources: vSphereClusters,
    errors: vSphereClusterErrors,
    isLoading: isLoadingVSphereClusters,
  } = useResources(
    Array.from(vSphereInstallations),
    VSphereCluster,
    {},
    { enabled: enabled && vSphereInstallations.size > 0 },
  );

  const {
    resources: vCDClusters,
    errors: vCDClusterErrors,
    isLoading: isLoadingVCDClusters,
  } = useResources(
    Array.from(vCDInstallations),
    VCDCluster,
    {},
    { enabled: enabled && vCDInstallations.size > 0 },
  );

  return useMemo(() => {
    return {
      resources: [
        ...awsClusters,
        ...azureClusters,
        ...vSphereClusters,
        ...vCDClusters,
      ],
      errors: [
        ...awsClusterErrors,
        ...azureClusterErrors,
        ...vSphereClusterErrors,
        ...vCDClusterErrors,
      ],
      isLoading:
        isLoadingAWSClusters ||
        isLoadingAzureClusters ||
        isLoadingVSphereClusters ||
        isLoadingVCDClusters,
    };
  }, [
    awsClusters,
    azureClusters,
    vSphereClusters,
    vCDClusters,
    awsClusterErrors,
    azureClusterErrors,
    vSphereClusterErrors,
    vCDClusterErrors,
    isLoadingAWSClusters,
    isLoadingAzureClusters,
    isLoadingVSphereClusters,
    isLoadingVCDClusters,
  ]);
}
