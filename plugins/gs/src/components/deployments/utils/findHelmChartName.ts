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
        const parts = url.split('/');

        return parts[parts.length - 1];
      }
    }
  }

  return undefined;
}
