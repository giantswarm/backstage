import { KubeObject, KubeObjectInterface } from './KubeObject';
import { FluxResourceStatusMixin, FluxResource } from './FluxResourceMixin';
import { FluxResourceStatus } from './FluxResourceStatusManager';

export interface HelmReleaseInterface extends KubeObjectInterface {
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

export class HelmRelease
  extends KubeObject<HelmReleaseInterface>
  implements FluxResource
{
  static apiVersion = 'v2beta1';
  static group = 'helm.toolkit.fluxcd.io';
  static kind = 'HelmRelease' as const;
  static plural = 'helmreleases';

  constructor(json: HelmReleaseInterface, cluster: string) {
    super(json, cluster);
    // Update status in global manager when resource is created
    this.updateFluxStatus();
  }

  getDependsOn() {
    return this.jsonData.spec?.dependsOn;
  }

  getKubeConfig() {
    return this.jsonData.spec?.kubeConfig;
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }

  getChart() {
    return this.jsonData.spec?.chart;
  }

  getChartRef() {
    return this.jsonData.spec?.chartRef;
  }

  findReadyCondition() {
    const conditions = this.getStatusConditions();
    if (!conditions) {
      return undefined;
    }

    return conditions.find(c => c.type === 'Ready');
  }

  isReconciling() {
    const readyCondition = this.findReadyCondition();

    return (
      readyCondition?.status === 'Unknown' &&
      readyCondition?.reason === 'Progressing'
    );
  }

  isSuspended() {
    return Boolean(this.jsonData.spec?.suspend);
  }

  /**
   * Update status in the global status manager
   */
  updateFluxStatus(): FluxResourceStatus {
    return FluxResourceStatusMixin.updateResourceStatus(this);
  }

  /**
   * Get current status from the global status manager
   */
  getFluxStatus(): FluxResourceStatus | null {
    return FluxResourceStatusMixin.getResourceStatus(this);
  }

  /**
   * Get or calculate current status
   */
  getOrCalculateFluxStatus(): FluxResourceStatus {
    return FluxResourceStatusMixin.getOrCalculateStatus(this);
  }
}
