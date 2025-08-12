import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useState } from 'react';

export function useResourceStatus(
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository,
) {
  const readyCondition = resource?.findReadyCondition();

  const [readyStatus, setReadyStatus] = useState(
    readyCondition?.status || 'Unknown',
  );

  useEffect(() => {
    if (
      !readyCondition?.status ||
      readyCondition.status === readyStatus ||
      readyCondition.status === 'Unknown'
    ) {
      return;
    }

    setReadyStatus(readyCondition.status);
  }, [readyCondition?.status, readyStatus]);

  return {
    readyStatus,
    isDependencyNotReady: readyCondition?.reason === 'DependencyNotReady',
    isReconciling: Boolean(resource?.isReconciling()),
    isSuspended: Boolean(resource?.isSuspended()),
  };
}
