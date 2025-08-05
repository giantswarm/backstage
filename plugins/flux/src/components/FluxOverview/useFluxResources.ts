import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useState } from 'react';

const RECONCILING_INTERVAL = 3000;
const NON_RECONCILING_INTERVAL = 15000;

export function useFluxResources(cluster: string) {
  const [refetchInterval, setRefetchInterval] = useState(
    NON_RECONCILING_INTERVAL,
  );

  const [kustomizationsEnabled, setKustomizationsEnabled] = useState(true);
  const [helmReleasesEnabled, setHelmReleasesEnabled] = useState(true);
  const [gitRepositoriesEnabled, setGitRepositoriesEnabled] = useState(true);
  const [ociRepositoriesEnabled, setOciRepositoriesEnabled] = useState(true);
  const [helmRepositoriesEnabled, setHelmRepositoriesEnabled] = useState(true);

  const {
    resources: kustomizations,
    isLoading: isLoadingKustomizations,
    errors: kustomizationsErrors,
  } = useResources(cluster, Kustomization, {
    refetchInterval,
    enabled: kustomizationsEnabled,
  });

  const {
    resources: helmReleases,
    isLoading: isLoadingHelmReleases,
    errors: helmReleasesErrors,
  } = useResources(cluster, HelmRelease, {
    refetchInterval,
    enabled: helmReleasesEnabled,
  });

  const {
    resources: gitRepositories,
    isLoading: isLoadingGitRepositories,
    errors: gitRepositoriesErrors,
  } = useResources(cluster, GitRepository, {
    refetchInterval,
    enabled: gitRepositoriesEnabled,
  });

  const {
    resources: ociRepositories,
    isLoading: isLoadingOciRepositories,
    errors: ociRepositoriesErrors,
  } = useResources(cluster, OCIRepository, {
    refetchInterval,
    enabled: ociRepositoriesEnabled,
  });

  const {
    resources: helmRepositories,
    isLoading: isLoadingHelmRepositories,
    errors: helmRepositoriesErrors,
  } = useResources(cluster, HelmRepository, {
    refetchInterval,
    enabled: helmRepositoriesEnabled,
  });

  useEffect(() => {
    if (kustomizationsErrors.length > 0) {
      setKustomizationsEnabled(false);
    }

    if (helmReleasesErrors.length > 0) {
      setHelmReleasesEnabled(false);
    }

    if (gitRepositoriesErrors.length > 0) {
      setGitRepositoriesEnabled(false);
    }

    if (ociRepositoriesErrors.length > 0) {
      setOciRepositoriesEnabled(false);
    }

    if (helmRepositoriesErrors.length > 0) {
      setHelmRepositoriesEnabled(false);
    }
  }, [
    kustomizationsErrors.length,
    helmReleasesErrors.length,
    gitRepositoriesErrors.length,
    helmRepositoriesErrors.length,
    ociRepositoriesErrors.length,
  ]);

  const isLoading =
    isLoadingKustomizations ||
    isLoadingHelmReleases ||
    isLoadingGitRepositories ||
    isLoadingOciRepositories ||
    isLoadingHelmRepositories;

  useEffect(() => {
    const reconciling = kustomizations.some(k => k.isReconciling());

    const newInterval = reconciling
      ? RECONCILING_INTERVAL
      : NON_RECONCILING_INTERVAL;

    if (newInterval !== refetchInterval) {
      setRefetchInterval(newInterval);
    }
  }, [kustomizations, refetchInterval]);

  return {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
  };
}
