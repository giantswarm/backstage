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
  // Get chartRef for HelmRelease deployments
  const chartRef =
    deployment instanceof HelmRelease ? deployment.getChartRef() : undefined;

  // Only fetch OCIRepository when chartRef references one
  const needsOciRepositoryFetch = chartRef?.kind === 'OCIRepository';

  const ociRepositoryName = chartRef?.name ?? '';
  const ociRepositoryNamespace = chartRef?.namespace ?? '';

  // Fetch OCIRepository only when needed (disabled when not an OCIRepository ref)
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

  // Calculate chart name using the utility function
  const chartName = useMemo(() => {
    return findHelmChartName(deployment, ociRepository);
  }, [deployment, ociRepository]);

  return {
    chartName,
    isLoading: needsOciRepositoryFetch ? isLoading : false,
    errorMessage,
  };
}
