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
  const [isDependencyNotReady, setIsDependencyNotReady] = useState(
    readyCondition?.reason === 'DependencyNotReady',
  );

  useEffect(() => {
    // Skip state update if no status or reconciliation is in progress
    if (
      !readyCondition?.status ||
      (readyCondition.status === 'Unknown' &&
        readyCondition.reason === 'Progressing')
    ) {
      return;
    }

    const newReadyStatus = readyCondition.status;
    const newIsDependencyNotReady =
      readyCondition.reason === 'DependencyNotReady';
    if (
      newReadyStatus === readyStatus &&
      newIsDependencyNotReady === isDependencyNotReady
    ) {
      return;
    }

    setReadyStatus(readyCondition.status);
    setIsDependencyNotReady(readyCondition.reason === 'DependencyNotReady');
  }, [
    isDependencyNotReady,
    readyCondition?.reason,
    readyCondition?.status,
    readyStatus,
  ]);

  return {
    readyStatus,
    isDependencyNotReady,
    isReconciling: Boolean(resource?.isReconciling()),
    isSuspended: Boolean(resource?.isSuspended()),
  };
}
