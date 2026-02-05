import {
  ErrorInfoUnion,
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useMemo, useState } from 'react';

const RECONCILING_INTERVAL = 3000;
const NON_RECONCILING_INTERVAL = 15000;

const isNotFoundError = (errorInfo: ErrorInfoUnion): boolean =>
  errorInfo.type !== 'incompatibility' &&
  errorInfo.error.name === 'NotFoundError';

export function useFluxResources(clusters: string | string[] | null) {
  const [refetchInterval, setRefetchInterval] = useState(
    NON_RECONCILING_INTERVAL,
  );

  const [kustomizationsEnabled, setKustomizationsEnabled] = useState(true);
  const [helmReleasesEnabled, setHelmReleasesEnabled] = useState(true);
  const [gitRepositoriesEnabled, setGitRepositoriesEnabled] = useState(true);
  const [ociRepositoriesEnabled, setOciRepositoriesEnabled] = useState(true);
  const [helmRepositoriesEnabled, setHelmRepositoriesEnabled] = useState(true);
  const [imagePoliciesEnabled, setImagePoliciesEnabled] = useState(true);
  const [imageRepositoriesEnabled, setImageRepositoriesEnabled] =
    useState(true);
  const [imageUpdateAutomationsEnabled, setImageUpdateAutomationsEnabled] =
    useState(true);

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

  const {
    resources: imagePolicies,
    isLoading: isLoadingImagePolicies,
    errors: imagePoliciesErrors,
  } = useResources(
    clusters!,
    ImagePolicy,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && imagePoliciesEnabled,
    },
  );

  const {
    resources: imageRepositories,
    isLoading: isLoadingImageRepositories,
    errors: imageRepositoriesErrors,
  } = useResources(
    clusters!,
    ImageRepository,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && imageRepositoriesEnabled,
    },
  );

  const {
    resources: imageUpdateAutomations,
    isLoading: isLoadingImageUpdateAutomations,
    errors: imageUpdateAutomationsErrors,
  } = useResources(
    clusters!,
    ImageUpdateAutomation,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && imageUpdateAutomationsEnabled,
    },
  );

  useEffect(() => {
    if (kustomizationsErrors.some(isNotFoundError)) {
      setKustomizationsEnabled(false);
    }

    if (helmReleasesErrors.some(isNotFoundError)) {
      setHelmReleasesEnabled(false);
    }

    if (gitRepositoriesErrors.some(isNotFoundError)) {
      setGitRepositoriesEnabled(false);
    }

    if (ociRepositoriesErrors.some(isNotFoundError)) {
      setOciRepositoriesEnabled(false);
    }

    if (helmRepositoriesErrors.some(isNotFoundError)) {
      setHelmRepositoriesEnabled(false);
    }

    if (imagePoliciesErrors.some(isNotFoundError)) {
      setImagePoliciesEnabled(false);
    }

    if (imageRepositoriesErrors.some(isNotFoundError)) {
      setImageRepositoriesEnabled(false);
    }

    if (imageUpdateAutomationsErrors.some(isNotFoundError)) {
      setImageUpdateAutomationsEnabled(false);
    }
  }, [
    kustomizationsErrors,
    helmReleasesErrors,
    gitRepositoriesErrors,
    ociRepositoriesErrors,
    helmRepositoriesErrors,
    imagePoliciesErrors,
    imageRepositoriesErrors,
    imageUpdateAutomationsErrors,
  ]);

  const isLoading =
    isLoadingKustomizations ||
    isLoadingHelmReleases ||
    isLoadingGitRepositories ||
    isLoadingOciRepositories ||
    isLoadingHelmRepositories ||
    isLoadingImagePolicies ||
    isLoadingImageRepositories ||
    isLoadingImageUpdateAutomations;

  const errors = useMemo(() => {
    return [
      ...kustomizationsErrors,
      ...helmReleasesErrors,
      ...gitRepositoriesErrors,
      ...helmRepositoriesErrors,
      ...ociRepositoriesErrors,
      ...imagePoliciesErrors,
      ...imageRepositoriesErrors,
      ...imageUpdateAutomationsErrors,
    ].filter(errorInfo => !isNotFoundError(errorInfo));
  }, [
    kustomizationsErrors,
    helmReleasesErrors,
    gitRepositoriesErrors,
    helmRepositoriesErrors,
    ociRepositoriesErrors,
    imagePoliciesErrors,
    imageRepositoriesErrors,
    imageUpdateAutomationsErrors,
  ]);

  useEffect(() => {
    const reconciling =
      kustomizations.some(k => k.isReconciling()) ||
      imagePolicies.some(p => p.isReconciling()) ||
      imageRepositories.some(r => r.isReconciling()) ||
      imageUpdateAutomations.some(a => a.isReconciling());

    const newInterval = reconciling
      ? RECONCILING_INTERVAL
      : NON_RECONCILING_INTERVAL;

    if (newInterval !== refetchInterval) {
      setRefetchInterval(newInterval);
    }
  }, [
    kustomizations,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
    refetchInterval,
    kustomizationsErrors,
    helmReleasesErrors,
    gitRepositoriesErrors,
    helmRepositoriesErrors,
    ociRepositoriesErrors,
    imagePoliciesErrors,
    imageRepositoriesErrors,
    imageUpdateAutomationsErrors,
  ]);

  return useMemo(() => {
    return {
      resources: {
        kustomizations,
        helmReleases,
        gitRepositories,
        ociRepositories,
        helmRepositories,
        imagePolicies,
        imageRepositories,
        imageUpdateAutomations,
      },
      isLoading,
      errors,
    };
  }, [
    errors,
    gitRepositories,
    helmReleases,
    helmRepositories,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
    isLoading,
    kustomizations,
    ociRepositories,
  ]);
}
