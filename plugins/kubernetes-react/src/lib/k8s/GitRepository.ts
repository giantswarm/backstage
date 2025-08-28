import { FluxObject, FluxObjectInterface } from './FluxObject';

export interface GitRepositoryInterface extends FluxObjectInterface {
  spec?: {
    ref?: {
      branch?: string;
      commit?: string;
      name?: string;
      semver?: string;
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

export class GitRepository extends FluxObject<GitRepositoryInterface> {
  static apiVersion = 'v1';
  static group = 'source.toolkit.fluxcd.io';
  static kind = 'GitRepository' as const;
  static plural = 'gitrepositories';

  getURL() {
    return this.jsonData.spec?.url;
  }

  getReference() {
    return this.jsonData.spec?.ref;
  }

  getRevision() {
    return this.jsonData.status?.artifact?.revision;
  }
}
