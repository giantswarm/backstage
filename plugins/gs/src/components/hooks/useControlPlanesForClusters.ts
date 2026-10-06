import {
  AzureASOManagedControlPlane,
  Cluster,
  ControlPlane,
  findControlPlaneModel,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMemo } from 'react';

/**
 * Lists the control planes the given clusters reference.
 *
 * Each control plane kind is listed only on the installations whose clusters
 * reference it, so an installation sees no discovery for a kind it does not
 * serve. There is one `useResources` per entry of `CONTROL_PLANE_MODELS`; the
 * rules of hooks do not allow a loop over the list.
 */
export function useControlPlanesForClusters(
  clusterResources: Cluster[],
  { enabled = true },
) {
  const kubeadmInstallations = new Set<string>();
  const azureManagedInstallations = new Set<string>();
  clusterResources.forEach(cluster => {
    const controlPlaneRef = cluster.getControlPlaneRef();
    if (!controlPlaneRef) {
      return;
    }

    switch (findControlPlaneModel(controlPlaneRef)) {
      case ControlPlane:
        kubeadmInstallations.add(cluster.cluster);
        break;
      case AzureASOManagedControlPlane:
        azureManagedInstallations.add(cluster.cluster);
        break;
      default:
        // A kind without a model (an EKS AWSManagedControlPlane) is not read.
        break;
    }
  });

  const { resources: kubeadmControlPlanes, errors: kubeadmControlPlaneErrors } =
    useResources(
      Array.from(kubeadmInstallations),
      ControlPlane,
      {},
      { enabled: enabled && kubeadmInstallations.size > 0 },
    );

  const {
    resources: azureManagedControlPlanes,
    errors: azureManagedControlPlaneErrors,
  } = useResources(
    Array.from(azureManagedInstallations),
    AzureASOManagedControlPlane,
    {},
    { enabled: enabled && azureManagedInstallations.size > 0 },
  );

  return useMemo(() => {
    return {
      resources: [...kubeadmControlPlanes, ...azureManagedControlPlanes],
      errors: [...kubeadmControlPlaneErrors, ...azureManagedControlPlaneErrors],
    };
  }, [
    kubeadmControlPlanes,
    azureManagedControlPlanes,
    kubeadmControlPlaneErrors,
    azureManagedControlPlaneErrors,
  ]);
}
