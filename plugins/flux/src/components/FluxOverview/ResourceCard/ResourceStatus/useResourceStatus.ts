import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useRef } from 'react';

export function useResourceStatus(
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository,
) {
  const readyCondition = resource?.findReadyCondition();

  const status = useRef(readyCondition?.status || 'Unknown');

  useEffect(() => {
    if (
      !readyCondition?.status ||
      readyCondition.status === status.current ||
      readyCondition.status === 'Unknown'
    ) {
      return;
    }

    status.current = readyCondition.status;
  }, [readyCondition?.status]);

  return {
    readyStatus: status.current,
    isReconciling: Boolean(resource?.isReconciling()),
    isSuspended: Boolean(resource?.isSuspended()),
  };
}
