import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface OCIRepositoryInterface extends KubeObjectInterface {
  spec?: {
    ref?: {
      digest?: string;
      semver?: string;
      semverFilter?: string;
      tag?: string;
    };
    suspend?: boolean;
    url: string;
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

export class OCIRepository extends KubeObject<OCIRepositoryInterface> {
  static apiVersion = 'v1';
  static group = 'source.toolkit.fluxcd.io';
  static kind = 'OCIRepository' as const;
  static plural = 'ocirepositories';

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  getURL() {
    return this.jsonData.spec?.url;
  }

  getReference() {
    return this.jsonData.spec?.ref;
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
