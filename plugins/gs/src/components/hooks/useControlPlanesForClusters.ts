import {
  AzureASOManagedControlPlane,
  Cluster,
  ControlPlane,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMemo } from 'react';

export function useControlPlanesForClusters(
  clusterResources: Cluster[],
  { enabled = true },
) {
  const installations = new Set<string>();
  // A CAPZ managed (AKS) cluster references an AzureASOManagedControlPlane
  // instead of a KubeadmControlPlane. Those are listed only on installations
  // that have such a cluster, so the other installations see no extra
  // discovery for a kind they do not serve.
  const azureManagedInstallations = new Set<string>();
  clusterResources.forEach(cluster => {
    installations.add(cluster.cluster);

    const controlPlaneRef = cluster.getControlPlaneRef();
    if (
      controlPlaneRef &&
      AzureASOManagedControlPlane.matchesRef(controlPlaneRef)
    ) {
      azureManagedInstallations.add(cluster.cluster);
    }
  });

  const {
    resources: controlPlanes,
    errors: controlPlaneErrors,
    isLoading: isLoadingControlPlanes,
  } = useResources(Array.from(installations), ControlPlane, {}, { enabled });

  const {
    resources: azureManagedControlPlanes,
    errors: azureManagedControlPlaneErrors,
    isLoading: isLoadingAzureManagedControlPlanes,
  } = useResources(
    Array.from(azureManagedInstallations),
    AzureASOManagedControlPlane,
    {},
    { enabled: enabled && azureManagedInstallations.size > 0 },
  );

  return useMemo(() => {
    return {
      resources: [...controlPlanes, ...azureManagedControlPlanes],
      errors: [...controlPlaneErrors, ...azureManagedControlPlaneErrors],
      isLoading: isLoadingControlPlanes || isLoadingAzureManagedControlPlanes,
    };
  }, [
    controlPlanes,
    azureManagedControlPlanes,
    controlPlaneErrors,
    azureManagedControlPlaneErrors,
    isLoadingControlPlanes,
    isLoadingAzureManagedControlPlanes,
  ]);
}
