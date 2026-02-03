import { useMemo } from 'react';
import {
  App,
  getErrorMessage,
  HelmRelease,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findHelmChartName } from '../deployments/utils/findHelmChartName';

export function useHelmChartNameForDeployment(deployment: App | HelmRelease) {
  // Try to get chart name directly from deployment first
  const directChartName = useMemo(() => {
    return findHelmChartName(deployment);
  }, [deployment]);

  // Get chartRef for HelmRelease deployments
  const chartRef =
    deployment instanceof HelmRelease ? deployment.getChartRef() : undefined;

  // Only fetch OCIRepository when:
  // 1. chartRef references an OCIRepository
  // 2. We couldn't get the chart name directly from the deployment
  const needsOciRepositoryFetch =
    chartRef?.kind === 'OCIRepository' && !directChartName;

  const ociRepositoryName = chartRef?.name ?? '';
  const ociRepositoryNamespace = chartRef?.namespace ?? '';

  // Fetch OCIRepository only when needed
  const {
    resource: ociRepository,
    isLoading,
    error,
  } = useResource(
    deployment.cluster,
    OCIRepository,
    {
      name: ociRepositoryName,
      namespace: ociRepositoryNamespace,
    },
    {
      enabled: Boolean(needsOciRepositoryFetch),
    },
  );

  let errorMessage;
  if (error) {
    errorMessage = getErrorMessage({
      error: error,
      resourceKind: OCIRepository.kind,
      resourceName: ociRepositoryName,
      resourceNamespace: ociRepositoryNamespace,
    });
  }

  // Use direct chart name if available, otherwise try with ociRepository
  const chartName = useMemo(() => {
    if (directChartName) {
      return directChartName;
    }
    return findHelmChartName(deployment, ociRepository);
  }, [directChartName, deployment, ociRepository]);

  return {
    chartName,
    isLoading: needsOciRepositoryFetch ? isLoading : false,
    errorMessage,
  };
}
