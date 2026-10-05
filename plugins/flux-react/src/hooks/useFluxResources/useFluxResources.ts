import {
  ErrorInfoUnion,
  FluxInstance,
  FluxObject,
  FluxReport,
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  MultiVersionResourceMatcher,
  OCIRepository,
  ResourceSet,
  ResourceSetInputProvider,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEffect, useMemo, useState } from 'react';
import {
  FluxResourceCollections,
  listFluxResources,
} from '../../utils/fluxResources';
import { awaitsReconcileHandling } from './awaitsReconcileHandling';

const RECONCILING_INTERVAL = 3000;
const NON_RECONCILING_INTERVAL = 15000;

const isNotFoundError = (errorInfo: ErrorInfoUnion): boolean =>
  errorInfo.type !== 'incompatibility' &&
  errorInfo.error.name === 'NotFoundError';

/**
 * Lists one Flux kind. A cluster without the kind's CRD answers 404; the kind is
 * then no longer requested, and the 404 is not reported as an error.
 */
function useFluxKind<R extends FluxObject>(
  clusters: string | string[] | null,
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): MultiVersionResourceMatcher;
  },
  refetchInterval: number,
) {
  const [enabled, setEnabled] = useState(true);

  const { resources, isLoading, errors } = useResources(
    clusters!,
    ResourceClass,
    {},
    {
      refetchInterval,
      enabled: Boolean(clusters) && enabled,
    },
  );

  const isCRDMissing = errors.some(isNotFoundError);
  useEffect(() => {
    if (isCRDMissing) {
      setEnabled(false);
    }
  }, [isCRDMissing]);

  const reportedErrors = useMemo(
    () => errors.filter(errorInfo => !isNotFoundError(errorInfo)),
    [errors],
  );

  return { resources, isLoading, errors: reportedErrors };
}

export function useFluxResources(clusters: string | string[] | null) {
  const [refetchInterval, setRefetchInterval] = useState(
    NON_RECONCILING_INTERVAL,
  );

  const kustomizations = useFluxKind(clusters, Kustomization, refetchInterval);
  const helmReleases = useFluxKind(clusters, HelmRelease, refetchInterval);
  const gitRepositories = useFluxKind(clusters, GitRepository, refetchInterval);
  const ociRepositories = useFluxKind(clusters, OCIRepository, refetchInterval);
  const helmRepositories = useFluxKind(
    clusters,
    HelmRepository,
    refetchInterval,
  );
  const imagePolicies = useFluxKind(clusters, ImagePolicy, refetchInterval);
  const imageRepositories = useFluxKind(
    clusters,
    ImageRepository,
    refetchInterval,
  );
  const imageUpdateAutomations = useFluxKind(
    clusters,
    ImageUpdateAutomation,
    refetchInterval,
  );
  const fluxInstances = useFluxKind(clusters, FluxInstance, refetchInterval);
  const resourceSets = useFluxKind(clusters, ResourceSet, refetchInterval);
  const resourceSetInputProviders = useFluxKind(
    clusters,
    ResourceSetInputProvider,
    refetchInterval,
  );
  const fluxReports = useFluxKind(clusters, FluxReport, refetchInterval);

  const resources: FluxResourceCollections = useMemo(
    () => ({
      kustomizations: kustomizations.resources,
      helmReleases: helmReleases.resources,
      gitRepositories: gitRepositories.resources,
      ociRepositories: ociRepositories.resources,
      helmRepositories: helmRepositories.resources,
      imagePolicies: imagePolicies.resources,
      imageRepositories: imageRepositories.resources,
      imageUpdateAutomations: imageUpdateAutomations.resources,
      fluxInstances: fluxInstances.resources,
      resourceSets: resourceSets.resources,
      resourceSetInputProviders: resourceSetInputProviders.resources,
      fluxReports: fluxReports.resources,
    }),
    [
      kustomizations.resources,
      helmReleases.resources,
      gitRepositories.resources,
      ociRepositories.resources,
      helmRepositories.resources,
      imagePolicies.resources,
      imageRepositories.resources,
      imageUpdateAutomations.resources,
      fluxInstances.resources,
      resourceSets.resources,
      resourceSetInputProviders.resources,
      fluxReports.resources,
    ],
  );

  const isLoading =
    kustomizations.isLoading ||
    helmReleases.isLoading ||
    gitRepositories.isLoading ||
    ociRepositories.isLoading ||
    helmRepositories.isLoading ||
    imagePolicies.isLoading ||
    imageRepositories.isLoading ||
    imageUpdateAutomations.isLoading ||
    fluxInstances.isLoading ||
    resourceSets.isLoading ||
    resourceSetInputProviders.isLoading ||
    fluxReports.isLoading;

  const errors = useMemo(
    () => [
      ...kustomizations.errors,
      ...helmReleases.errors,
      ...gitRepositories.errors,
      ...helmRepositories.errors,
      ...ociRepositories.errors,
      ...imagePolicies.errors,
      ...imageRepositories.errors,
      ...imageUpdateAutomations.errors,
      ...fluxInstances.errors,
      ...resourceSets.errors,
      ...resourceSetInputProviders.errors,
      ...fluxReports.errors,
    ],
    [
      kustomizations.errors,
      helmReleases.errors,
      gitRepositories.errors,
      helmRepositories.errors,
      ociRepositories.errors,
      imagePolicies.errors,
      imageRepositories.errors,
      imageUpdateAutomations.errors,
      fluxInstances.errors,
      resourceSets.errors,
      resourceSetInputProviders.errors,
      fluxReports.errors,
    ],
  );

  useEffect(() => {
    const reconciling = [
      ...resources.kustomizations,
      ...resources.imagePolicies,
      ...resources.imageRepositories,
      ...resources.imageUpdateAutomations,
      ...resources.fluxInstances,
      ...resources.resourceSets,
      ...resources.resourceSetInputProviders,
    ].some(r => r.isReconciling());

    // An on-demand reconciliation the controller has not picked up yet also
    // deserves the fast poll: the details panel disables its Reconcile button
    // until the request is handled, and the slow interval would leave it
    // disabled for far longer than the controller actually takes. See
    // `awaitsReconcileHandling` for the cases excluded to keep this bounded.
    const requestPending = listFluxResources(resources).some(
      awaitsReconcileHandling,
    );

    const newInterval =
      reconciling || requestPending
        ? RECONCILING_INTERVAL
        : NON_RECONCILING_INTERVAL;

    if (newInterval !== refetchInterval) {
      setRefetchInterval(newInterval);
    }
  }, [resources, refetchInterval]);

  return useMemo(
    () => ({ resources, isLoading, errors }),
    [resources, isLoading, errors],
  );
}
