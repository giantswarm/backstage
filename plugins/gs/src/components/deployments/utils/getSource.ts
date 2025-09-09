import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

function formatAppCatalogName(name: string) {
  return name.endsWith('-catalog') ? name : `${name}-catalog`;
}

function getHelmReleaseSourceKind(helmRelease: HelmRelease) {
  const sourceRef = helmRelease.getChartSourceRef();

  return sourceRef?.kind;
}

function getHelmReleaseSourceName(
  helmRelease: HelmRelease,
): string | undefined {
  const sourceRef = helmRelease.getChartSourceRef();

  return sourceRef?.name;
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
