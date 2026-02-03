import {
  App,
  HelmRelease,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function findHelmChartName(
  deployment: App | HelmRelease,
  sourceRepository?: OCIRepository | null,
) {
  if (deployment instanceof App) {
    const spec = deployment.getSpec();

    return spec?.name;
  }

  if (deployment instanceof HelmRelease) {
    const chart = deployment.getChart();
    const chartRef = deployment.getChartRef();

    if (chart) {
      return chart.spec?.chart;
    }

    if (chartRef) {
      const url = sourceRepository?.getURL();
      if (url) {
        // Extract last path segment from URL like "oci://ghcr.io/org/charts/podinfo"
        // Handle edge cases: trailing slashes, query params
        // Remove query string first, then extract path segments
        const urlWithoutQuery = url.split('?')[0];
        const pathSegments = urlWithoutQuery.split('/').filter(Boolean);
        const chartName = pathSegments[pathSegments.length - 1];

        return chartName || undefined;
      }
    }
  }

  return undefined;
}
