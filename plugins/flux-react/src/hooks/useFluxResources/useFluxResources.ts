import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useMemo, useState } from 'react';

const RECONCILING_INTERVAL = 3000;
const NON_RECONCILING_INTERVAL = 15000;

export function useFluxResources(clusters: string | string[] | null) {
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
  } = useResources(
    clusters!,
    Kustomization,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && kustomizationsEnabled,
    },
  );

  const {
    resources: helmReleases,
    isLoading: isLoadingHelmReleases,
    errors: helmReleasesErrors,
  } = useResources(
    clusters!,
    HelmRelease,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && helmReleasesEnabled,
    },
  );

  const {
    resources: gitRepositories,
    isLoading: isLoadingGitRepositories,
    errors: gitRepositoriesErrors,
  } = useResources(
    clusters!,
    GitRepository,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && gitRepositoriesEnabled,
    },
  );

  const {
    resources: ociRepositories,
    isLoading: isLoadingOciRepositories,
    errors: ociRepositoriesErrors,
  } = useResources(
    clusters!,
    OCIRepository,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && ociRepositoriesEnabled,
    },
  );

  const {
    resources: helmRepositories,
    isLoading: isLoadingHelmRepositories,
    errors: helmRepositoriesErrors,
  } = useResources(
    clusters!,
    HelmRepository,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && helmRepositoriesEnabled,
    },
  );

  useEffect(() => {
    if (
      kustomizationsErrors.some(({ error }) => error.name === 'NotFoundError')
    ) {
      setKustomizationsEnabled(false);
    }

    if (
      helmReleasesErrors.some(({ error }) => error.name === 'NotFoundError')
    ) {
      setHelmReleasesEnabled(false);
    }

    if (
      gitRepositoriesErrors.some(({ error }) => error.name === 'NotFoundError')
    ) {
      setGitRepositoriesEnabled(false);
    }

    if (
      ociRepositoriesErrors.some(({ error }) => error.name === 'NotFoundError')
    ) {
      setOciRepositoriesEnabled(false);
    }

    if (
      helmRepositoriesErrors.some(({ error }) => error.name === 'NotFoundError')
    ) {
      setHelmRepositoriesEnabled(false);
    }
  }, [
    kustomizationsErrors,
    helmReleasesErrors,
    gitRepositoriesErrors,
    ociRepositoriesErrors,
    helmRepositoriesErrors,
  ]);

  const isLoading =
    isLoadingKustomizations ||
    isLoadingHelmReleases ||
    isLoadingGitRepositories ||
    isLoadingOciRepositories ||
    isLoadingHelmRepositories;

  const errors = useMemo(() => {
    return [
      ...kustomizationsErrors,
      ...helmReleasesErrors,
      ...gitRepositoriesErrors,
      ...helmRepositoriesErrors,
      ...ociRepositoriesErrors,
    ].filter(error => error.error.name !== 'NotFoundError');
  }, [
    kustomizationsErrors,
    helmReleasesErrors,
    gitRepositoriesErrors,
    helmRepositoriesErrors,
    ociRepositoriesErrors,
  ]);

  useEffect(() => {
    const reconciling = kustomizations.some(k => k.isReconciling());

    const newInterval = reconciling
      ? RECONCILING_INTERVAL
      : NON_RECONCILING_INTERVAL;

    if (newInterval !== refetchInterval) {
      setRefetchInterval(newInterval);
    }
  }, [kustomizations, refetchInterval]);

  return useMemo(() => {
    return {
      resources: {
        kustomizations,
        helmReleases,
        gitRepositories,
        ociRepositories,
        helmRepositories,
      },
      isLoading,
      errors,
    };
  }, [
    errors,
    gitRepositories,
    helmReleases,
    helmRepositories,
    isLoading,
    kustomizations,
    ociRepositories,
  ]);
}
