import { useMemo } from 'react';
import {
  HelmRelease,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useCatalogEntityForDeployment } from '../../hooks/useCatalogEntityForDeployment';

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

/**
 * Derives automatic upgrades setting from an OCIRepository semver range.
 * Manifest formats: ~X.Y.Z (patch), ^X.Y.Z (minor), >=X.Y.Z (major).
 */
function deriveAutomaticUpgrades(
  ref: { semver?: string; tag?: string } | undefined,
): string {
  if (!ref?.semver) return 'no-upgrades';

  const semver = ref.semver;

  if (semver.startsWith('~')) return 'patch-upgrades';
  if (semver.startsWith('^')) return 'minor-upgrades';
  if (semver.startsWith('>=')) return 'major-upgrades';

  return 'no-upgrades';
}

export function useEditDeploymentData(
  deployment: HelmRelease,
  installationName: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;

  const { catalogEntity, isLoading: isLoadingEntity } =
    useCatalogEntityForDeployment(deployment);

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
    const entityRef = catalogEntity
      ? stringifyEntityRef(catalogEntity)
      : undefined;

    const ociRef = ociRepository?.getReference();
    const ociUrl = ociRepository?.getURL();

    return {
      entityRef,
      chartRef: deriveChartRef(ociUrl),
      chartTag: deriveChartTag(ociRef),
      automaticUpgrades: deriveAutomaticUpgrades(ociRef),
      isLoading: isLoadingEntity || (needsOciRepository ? isLoadingOci : false),
    };
  }, [
    catalogEntity,
    ociRepository,
    isLoadingEntity,
    isLoadingOci,
    needsOciRepository,
  ]);
}
