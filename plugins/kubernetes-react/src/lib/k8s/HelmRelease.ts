import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface HelmReleaseInterface extends KubeObjectInterface {
  spec?: {
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

export class HelmRelease extends KubeObject<HelmReleaseInterface> {
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

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
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
}
