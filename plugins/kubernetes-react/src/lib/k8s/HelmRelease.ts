import { FluxObject, FluxObjectInterface } from './FluxObject';

export interface HelmReleaseInterface extends FluxObjectInterface {
  spec?: {
    chart: {
      metadata?: {
        annotations?: {
          [k: string]: string;
        };
        labels?: {
          [k: string]: string;
        };
      };
      spec: {
        chart: string;
        interval?: string;
        reconcileStrategy?: 'ChartVersion' | 'Revision';
        sourceRef: {
          apiVersion?: string;
          kind: 'HelmRepository' | 'GitRepository' | 'Bucket';
          name: string;
          namespace?: string;
        };
        valuesFile?: string;
        valuesFiles?: string[];
        verify?: {
          provider: 'cosign';
          secretRef?: {
            name: string;
          };
        };
        version?: string;
      };
    };
    chartRef?: {
      apiVersion?: string;
      kind: 'OCIRepository' | 'HelmChart';
      name: string;
      namespace?: string;
    };
    dependsOn?: {
      name: string;
      namespace?: string;
    }[];
    kubeConfig?: {
      secretRef: {
        key?: string;
        name: string;
      };
    };
    suspend?: boolean;
  };
  status?: {
    conditions?: {
      lastTransitionTime: string;
      message: string;
      observedGeneration?: number;
      reason: string;
      status: 'True' | 'False' | 'Unknown';
      type: string;
    }[];
    lastAppliedRevision?: string;
    lastAttemptedRevision?: string;
  };
}

export class HelmRelease extends FluxObject<HelmReleaseInterface> {
  static apiVersion = 'v2beta1';
  static group = 'helm.toolkit.fluxcd.io';
  static kind = 'HelmRelease' as const;
  static plural = 'helmreleases';

  getDependsOn() {
    return this.jsonData.spec?.dependsOn;
  }

  getKubeConfig() {
    return this.jsonData.spec?.kubeConfig;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }

  getLastAttemptedRevision() {
    return this.jsonData.status?.lastAttemptedRevision;
  }

  getChart() {
    return this.jsonData.spec?.chart;
  }

  getChartName() {
    return this.jsonData.spec?.chart.spec.chart;
  }

  getChartRef() {
    return this.jsonData.spec?.chartRef;
  }

  getChartSourceRef() {
    return this.jsonData.spec?.chart.spec.sourceRef;
  }
}
