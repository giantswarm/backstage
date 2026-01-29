import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';
import { compareDates } from '../../utils/compareDates';

type HelmReleaseInterface = crds.fluxcd.v2.HelmRelease;

export class HelmRelease extends FluxObject<HelmReleaseInterface> {
  static readonly supportedVersions = ['v2'] as const;
  static readonly group = 'helm.toolkit.fluxcd.io';
  static readonly kind = 'HelmRelease' as const;
  static readonly plural = 'helmreleases';

  getDependsOn() {
    return this.jsonData.spec?.dependsOn;
  }

  getKubeConfig() {
    return this.jsonData.spec?.kubeConfig;
  }

  getLastAppliedRevision() {
    const history = this.jsonData.status?.history;
    if (!history || history.length === 0) {
      return undefined;
    }

    // Sort history by lastDeployed timestamp (most recent first) and get the chart version
    const sortedHistory = history.sort((a, b) =>
      compareDates(b.lastDeployed, a.lastDeployed),
    );

    return sortedHistory[0]?.chartVersion;
  }

  getLastAttemptedRevision() {
    return this.jsonData.status?.lastAttemptedRevision;
  }

  getChart() {
    return this.jsonData.spec?.chart;
  }

  getChartName() {
    return this.jsonData.spec?.chart?.spec.chart;
  }

  getChartRef() {
    return this.jsonData.spec?.chartRef;
  }

  getChartSourceRef() {
    return this.jsonData.spec?.chart?.spec.sourceRef;
  }
}
