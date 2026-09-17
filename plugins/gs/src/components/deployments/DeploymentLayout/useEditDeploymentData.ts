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
 * Supports Masterminds/semver wildcard placeholders (x, X, *),
 * normalizing them to `0` (e.g. `1.2.x` → `1.2.0`).
 */
export function deriveChartTag(
  ref: { semver?: string; tag?: string; digest?: string } | undefined,
): string | undefined {
  if (!ref) return undefined;
  if (ref.tag) return ref.tag;
  if (!ref.semver) return undefined;

  const s = ref.semver.trim();

  // Strip leading constraint operator (>=, <=, !=, >, <, =, ~, ^)
  const stripped = s.replace(/^(?:>=|<=|!=|[><=~^])\s*/, '');

  // Match a version where components may be digits or wildcards (x, X, *)
  const wcMatch = stripped.match(
    /^(\d+|[xX*])(?:\.(\d+|[xX*])(?:\.(\d+|[xX*])(?:-([^\s<>]+))?)?)?$/,
  );
  if (wcMatch) {
    const toNum = (v: string | undefined) =>
      !v || /^[xX*]$/.test(v) ? '0' : v;
    const major = toNum(wcMatch[1]);
    const minor = toNum(wcMatch[2]);
    const patch = toNum(wcMatch[3]);
    const pre = wcMatch[4];
    return pre
      ? `${major}.${minor}.${patch}-${pre}`
      : `${major}.${minor}.${patch}`;
  }

  // Fallback: extract first concrete version from compound range (e.g. ">=1.2.3 <2.0.0")
  const match = s.match(/(\d+\.\d+\.\d+(?:-[^\s<>]+)?)/);
  return match ? match[1] : undefined;
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

    return {
      chartRef: deriveChartRef(ociUrl),
      chartTag: deriveChartTag(ociRef),
      automaticUpgrades: deriveAutoUpgradeMode(ociRef),
      isLoading: needsOciRepository ? isLoadingOci : false,
    };
  }, [ociRepository, isLoadingOci, needsOciRepository]);
}
