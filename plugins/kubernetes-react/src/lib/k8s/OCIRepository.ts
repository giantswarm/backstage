import { FluxObject, FluxObjectInterface } from './FluxObject';

export interface OCIRepositoryInterface extends FluxObjectInterface {
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

export class OCIRepository extends FluxObject<OCIRepositoryInterface> {
  static apiVersion = 'v1';
  static group = 'source.toolkit.fluxcd.io';
  static kind = 'OCIRepository' as const;
  static plural = 'ocirepositories';

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
