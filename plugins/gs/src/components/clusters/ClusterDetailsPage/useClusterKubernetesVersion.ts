import {
  AnyControlPlane,
  ControlPlane,
  findControlPlaneModel,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from './useCurrentCluster';
import { useIsExpectedClusterError } from './useIsExpectedClusterError';

/**
 * The current cluster's Kubernetes version, from its control plane, with the
 * control plane's fetch and API-version errors. `version` stays undefined for
 * a cluster without a control plane reference yet (one still being created,
 * or an imported one) and for a control plane kind the portal cannot read.
 */
export function useClusterKubernetesVersion(): {
  isLoading: boolean;
  version?: string;
  errorMessage?: string;
} {
  const { cluster, installationName } = useCurrentCluster();
  const isExpectedError = useIsExpectedClusterError();

  const controlPlaneRef = cluster.getControlPlaneRef();
  const controlPlaneName = controlPlaneRef?.name ?? '';
  const controlPlaneNamespace = controlPlaneRef?.namespace;

  // The reference decides which control plane kind to read: a
  // KubeadmControlPlane, or the AzureASOManagedControlPlane of an AKS
  // cluster. A kind without a model in CONTROL_PLANE_MODELS (an EKS cluster's
  // AWSManagedControlPlane, say) would only 404, so its fetch stays disabled
  // and the Kubernetes version reads as not available.
  const ControlPlaneModel = controlPlaneRef
    ? findControlPlaneModel(controlPlaneRef)
    : undefined;
  const hasSupportedControlPlane = ControlPlaneModel !== undefined;

  const {
    resource: controlPlane,
    isLoading,
    errors,
    error,
    incompatibilities,
  } = useResource<AnyControlPlane>(
    installationName,
    ControlPlaneModel ?? ControlPlane,
    {
      name: controlPlaneName,
      namespace: controlPlaneNamespace,
    },
    { enabled: hasSupportedControlPlane },
  );

  let errorMessage;
  if (error && !isExpectedError(error)) {
    errorMessage = getErrorMessage({
      error,
      resourceKind: (ControlPlaneModel ?? ControlPlane).kind,
      resourceName: controlPlaneName,
      resourceNamespace: controlPlaneNamespace,
    });
  }
  // A disabled query still returns incompatibilities from ControlPlane
  // discovery that another page has cached. The hook cannot tell whether a
  // caller disabled its query to mean "not yet" or "does not apply", so they
  // are kept out here when there is no supported control plane to read.
  if (hasSupportedControlPlane && incompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(incompatibilities[0]);
  }

  useShowErrors(hasSupportedControlPlane ? errors : null);

  return {
    isLoading,
    version: controlPlane ? controlPlane.getK8sVersion() : undefined,
    errorMessage,
  };
}
