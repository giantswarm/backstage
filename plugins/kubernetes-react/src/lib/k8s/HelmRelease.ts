import { FluxObject, FluxObjectInterface } from './FluxObject';
import { compareDates } from '../../utils/compareDates';

export interface HelmReleaseInterface extends FluxObjectInterface {
  spec?: {
    chart?: {
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
        ignoreMissingValuesFiles?: boolean;
        interval?: string;
        reconcileStrategy?: 'ChartVersion' | 'Revision';
        sourceRef: {
          apiVersion?: string;
          kind: 'HelmRepository' | 'GitRepository' | 'Bucket';
          name: string;
          namespace?: string;
        };
        valuesFiles?: string[];
        verify?: {
          provider: 'cosign' | 'notation';
          secretRef?: {
            name: string;
          };
        };
        version?: string;
      };
    };
    chartRef?: {
      apiVersion?: string;
      kind: 'OCIRepository' | 'HelmChart' | 'ExternalArtifact';
      name: string;
      namespace?: string;
    };
    dependsOn?: {
      name: string;
      namespace?: string;
      readyExpr?: string;
    }[];
    kubeConfig?: {
      configMapRef?: {
        name: string;
      };
      secretRef?: {
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
    failures?: number;
    helmChart?: string;
    history?: {
      apiVersion?: string;
      appVersion?: string;
      chartName: string;
      chartVersion: string;
      configDigest: string;
      deleted?: string;
      digest: string;
      firstDeployed: string;
      lastDeployed: string;
      name: string;
      namespace: string;
      ociDigest?: string;
      status: string;
      testHooks?: {
        [k: string]: {
          lastCompleted?: string;
          lastStarted?: string;
          phase?: string;
        };
      };
      version: number;
    }[];
    installFailures?: number;
    lastAttemptedConfigDigest?: string;
    lastAttemptedGeneration?: number;
    lastAttemptedReleaseAction?: 'install' | 'upgrade';
    lastAttemptedReleaseActionDuration?: string;
    lastAttemptedRevision?: string;
    lastAttemptedRevisionDigest?: string;
    lastAttemptedValuesChecksum?: string;
    lastHandledForceAt?: string;
    lastHandledReconcileAt?: string;
    lastHandledResetAt?: string;
    lastReleaseRevision?: number;
    observedCommonMetadataDigest?: string;
    observedGeneration?: number;
    observedPostRenderersDigest?: string;
    storageNamespace?: string;
    upgradeFailures?: number;
  };
}

export class HelmRelease extends FluxObject<HelmReleaseInterface> {
  static apiVersion = 'v2';
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
