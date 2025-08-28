import { FluxObject, FluxObjectInterface } from './FluxObject';

export interface HelmRepositoryInterface extends FluxObjectInterface {
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

export class HelmRepository extends FluxObject<HelmRepositoryInterface> {
  static apiVersion = 'v1beta2';
  static group = 'source.toolkit.fluxcd.io';
  static kind = 'HelmRepository' as const;
  static plural = 'helmrepositories';

  getURL() {
    return this.jsonData.spec?.url;
  }

  getRevision() {
    return this.jsonData.status?.artifact?.revision;
  }
}
