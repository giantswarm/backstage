import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface HelmRepositoryInterface extends KubeObjectInterface {
  spec?: {
    url: string;
    suspend?: boolean;
  };
  status?: {
    artifact?: {
      revision: string;
    };
    conditions?: {
      lastTransitionTime: string;
      message: string;
      observedGeneration?: number;
      reason: string;
      status: 'True' | 'False' | 'Unknown';
      type: string;
    }[];
  };
}

export class HelmRepository extends KubeObject<HelmRepositoryInterface> {
  static apiVersion = 'v1beta2';
  static group = 'source.toolkit.fluxcd.io';
  static kind = 'HelmRepository' as const;
  static plural = 'helmrepositories';

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  getURL() {
    return this.jsonData.spec?.url;
  }

  getRevision() {
    return this.jsonData.status?.artifact?.revision;
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
}
