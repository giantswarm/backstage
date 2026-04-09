import { useMemo } from 'react';
import {
  HelmRelease,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { deriveAutoUpgradeMode } from '../utils/getAutoUpgradeSettings';

/**
 * Derives chart reference (OCI registry path) from an OCIRepository URL.
 * Strips the `oci://` prefix.
 */
function deriveChartRef(ociUrl: string | undefined): string | undefined {
  if (!ociUrl) return undefined;
  return ociUrl.replace(/^oci:\/\//, '');
}

/**
 * Derives the chart tag from an OCIRepository reference.
 * For semver ranges like `>=1.2.3`, extracts the base version.
 * For exact tags like `1.2.3`, returns as-is.
 */
function deriveChartTag(
  ref: { semver?: string; tag?: string; digest?: string } | undefined,
): string | undefined {
  if (!ref) return undefined;

  if (ref.tag) return ref.tag;

  if (ref.semver) {
    // Extract version from semver range, e.g. ">=1.2.3 <2.0.0" → "1.2.3"
    const match = ref.semver.match(/(\d+\.\d+\.\d+(?:-[^\s<>]+)?)/);
    return match ? match[1] : undefined;
  }

  return undefined;
}

export function useEditDeploymentData(
  deployment: HelmRelease,
  installationName: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;

  const chartRef = deployment.getChartRef();

  const ociRepositoryName = chartRef?.name ?? '';
  const ociRepositoryNamespace = chartRef?.namespace ?? '';
  const needsOciRepository = chartRef?.kind === 'OCIRepository';

  const { resource: ociRepository, isLoading: isLoadingOci } = useResource(
    installationName,
    OCIRepository,
    {
      name: ociRepositoryName,
      namespace: ociRepositoryNamespace,
    },
    {
      enabled: enabled && Boolean(needsOciRepository),
    },
  );

  return useMemo(() => {
    const ociRef = ociRepository?.getReference();
    const ociUrl = ociRepository?.getURL();

    const hasInline = deployment.hasInlineValues();
    const valuesFromEntries = deployment.getValuesFrom() ?? [];
    const valuesMode =
      hasInline && valuesFromEntries.length === 0 ? 'inline' : 'valuesFrom';

    return {
      chartRef: deriveChartRef(ociUrl),
      chartTag: deriveChartTag(ociRef),
      automaticUpgrades: deriveAutoUpgradeMode(ociRef),
      valuesMode,
      isLoading: needsOciRepository ? isLoadingOci : false,
    };
  }, [deployment, ociRepository, isLoadingOci, needsOciRepository]);
}
