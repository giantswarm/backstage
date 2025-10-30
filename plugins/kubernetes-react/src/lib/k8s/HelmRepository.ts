import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type HelmRepositoryInterface = crds.fluxcd.v1.HelmRepository;

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
