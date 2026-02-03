import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

function formatAppCatalogName(name: string) {
  return name.endsWith('-catalog') ? name : `${name}-catalog`;
}

function getHelmReleaseSourceKind(helmRelease: HelmRelease) {
  // Try traditional chart source first
  const sourceRef = helmRelease.getChartSourceRef();
  if (sourceRef?.kind) {
    return sourceRef.kind;
  }

  // Fall back to chartRef for OCIRepository-based charts
  const chartRef = helmRelease.getChartRef();
  return chartRef?.kind;
}

function getHelmReleaseSourceName(
  helmRelease: HelmRelease,
): string | undefined {
  // Try traditional chart source first
  const sourceRef = helmRelease.getChartSourceRef();
  if (sourceRef?.name) {
    return sourceRef.name;
  }

  // Fall back to chartRef for OCIRepository-based charts
  const chartRef = helmRelease.getChartRef();
  return chartRef?.name;
}

export function getSourceKind(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return 'AppCatalog';
  }

  if (deployment instanceof HelmRelease) {
    return getHelmReleaseSourceKind(deployment);
  }

  return undefined;
}

export function getSourceName(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return formatAppCatalogName(deployment.getCatalogName() ?? '');
  }

  if (deployment instanceof HelmRelease) {
    return getHelmReleaseSourceName(deployment);
  }

  return undefined;
}
