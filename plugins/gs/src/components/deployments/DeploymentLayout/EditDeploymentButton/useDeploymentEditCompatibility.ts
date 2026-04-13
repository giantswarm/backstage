import { useMemo } from 'react';
import {
  HelmRelease,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

function getIncompatibleReasons(
  deployment: HelmRelease,
  ociRepository: OCIRepository | undefined,
  isLoading: boolean,
): string[] {
  if (isLoading) return [];
  const reasons: string[] = [];
  const name = deployment.getName();
  const namespace = deployment.getNamespace();
  const chartRefData = deployment.getChartRef();

  // 1. Must use spec.chartRef, not spec.chart (inline chart definition)
  if (!chartRefData && deployment.getChart()) {
    reasons.push('uses inline chart source (only OCIRepository is supported)');
    return reasons;
  }

  // 2. Source type must be OCIRepository
  if (chartRefData && chartRefData.kind !== 'OCIRepository') {
    reasons.push(
      `uses ${chartRefData.kind} source (only OCIRepository is supported)`,
    );
    return reasons;
  }

  // 3. OCIRepository name must match HelmRelease name
  if (chartRefData && chartRefData.name !== name) {
    reasons.push('OCIRepository name does not match deployment name');
  }

  // 4. OCIRepository namespace must match HelmRelease namespace
  if (chartRefData && chartRefData.namespace !== namespace) {
    reasons.push('OCIRepository namespace does not match deployment namespace');
  }

  // 5. releaseName must match metadata name (if set)
  const releaseName = deployment.getReleaseName();
  if (releaseName && releaseName !== name) {
    reasons.push('release name does not match deployment name');
  }

  // 6. OCIRepository must use tag or semver (not digest)
  if (ociRepository) {
    const ref = ociRepository.getReference();
    if (ref && !ref.tag && !ref.semver) {
      reasons.push(
        'OCIRepository uses digest pinning (tag or semver required)',
      );
    }
  }

  // 7. valuesFrom entries must use the default 'values' key
  const valuesFrom = deployment.getValuesFrom() ?? [];
  const nonDefaultKeys = valuesFrom.filter(
    v => v.valuesKey && v.valuesKey !== 'values',
  );
  if (nonDefaultKeys.length > 0) {
    reasons.push(
      "uses non-standard valuesKey in valuesFrom (only 'values' is supported)",
    );
  }

  return reasons;
}

export function useDeploymentEditCompatibility(
  deployment: HelmRelease,
  installationName: string,
  options: { enabled?: boolean } = {},
): {
  incompatibleReasons: string[];
  isCompatible: boolean;
  isLoading: boolean;
} {
  const enabled = options.enabled ?? true;

  const chartRef = deployment.getChartRef();
  const needsOciRepository = chartRef?.kind === 'OCIRepository';

  const { resource: ociRepository, isLoading: isLoadingOci } = useResource(
    installationName,
    OCIRepository,
    {
      name: chartRef?.name ?? '',
      namespace: chartRef?.namespace ?? '',
    },
    {
      enabled: enabled && Boolean(needsOciRepository),
    },
  );

  const isLoading = needsOciRepository ? isLoadingOci : false;

  return useMemo(() => {
    const incompatibleReasons = getIncompatibleReasons(
      deployment,
      ociRepository,
      isLoading,
    );

    return {
      incompatibleReasons,
      isCompatible: incompatibleReasons.length === 0,
      isLoading,
    };
  }, [deployment, ociRepository, isLoading]);
}
