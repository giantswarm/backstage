import { useMemo } from 'react';
import {
  HelmRelease,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  deriveAutoUpgradeSettings,
  deriveChartVersion,
  versionFromRevision,
} from '../utils/getAutoUpgradeSettings';

/**
 * Derives chart reference (OCI registry path) from an OCIRepository URL.
 * Strips the `oci://` prefix.
 */
function deriveChartRef(ociUrl: string | undefined): string | undefined {
  if (!ociUrl) return undefined;
  return ociUrl.replace(/^oci:\/\//, '');
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
    const currentVersion = versionFromRevision(ociRepository?.getRevision());

    return {
      chartRef: deriveChartRef(ociUrl),
      chartTag: deriveChartVersion(ociRef, currentVersion),
      autoUpgrades: ociRepository
        ? deriveAutoUpgradeSettings(ociRef, currentVersion)
        : undefined,
      isLoading: needsOciRepository ? isLoadingOci : false,
    };
  }, [ociRepository, isLoadingOci, needsOciRepository]);
}
