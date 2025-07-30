import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface GitRepositoryInterface extends KubeObjectInterface {
  spec?: {
    ref?: {
      branch?: string;
      commit?: string;
      name?: string;
      semver?: string;
      tag?: string;
    };
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

export class GitRepository extends KubeObject<GitRepositoryInterface> {
  static apiVersion = 'v1';
  static group = 'source.toolkit.fluxcd.io';
  static kind = 'GitRepository' as const;
  static plural = 'gitrepositories';

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
}
