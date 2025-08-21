import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
  fluxResourceStatusManager,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useState, useMemo } from 'react';

type FluxResource =
  | Kustomization
  | HelmRelease
  | GitRepository
  | OCIRepository
  | HelmRepository;

export function useResourceStatus(resource?: FluxResource) {
  // Get initial status from the global manager or calculate it
  const initialStatus = resource?.getOrCalculateFluxStatus() || {
    readyStatus: 'Unknown' as const,
    isDependencyNotReady: false,
    isReconciling: false,
    isSuspended: false,
  };

  const [status, setStatus] = useState(initialStatus);

  // Memoize resource identifiers to avoid unnecessary effect runs
  const resourceIdentifiers = useMemo(() => {
    if (!resource) return null;

    const cluster = resource.cluster;
    const kind = resource.getKind();
    const namespace = resource.getNamespace();
    const name = resource.getName();

    return {
      cluster,
      kind,
      namespace,
      name,
      key: `${cluster}:${kind}:${namespace || 'default'}:${name}`,
    };
  }, [resource]);

  // Memoize resource state to avoid unnecessary effect runs
  const resourceState = useMemo(() => {
    if (!resource) return null;

    const readyCondition = resource.findReadyCondition();
    return {
      readyStatus: readyCondition?.status,
      readyReason: readyCondition?.reason,
      isReconciling: resource.isReconciling(),
      isSuspended: resource.isSuspended(),
    };
  }, [resource]);

  useEffect(() => {
    if (!resource || !resourceIdentifiers) {
      return undefined;
    }

    // Listen for status updates from the global manager
    const unsubscribe = fluxResourceStatusManager.addStatusListener(
      (key, newStatus) => {
        if (key === resourceIdentifiers.key) {
          setStatus(newStatus);
        }
      },
    );

    // Update status when resource changes
    const currentStatus = resource.getOrCalculateStatus();
    setStatus(currentStatus);

    return unsubscribe;
  }, [resource, resourceIdentifiers, resourceState]);

  return status;
}
