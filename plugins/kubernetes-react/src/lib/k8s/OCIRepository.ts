import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type OCIRepositoryInterface = crds.fluxcd.v1beta2.OCIRepository;

export class OCIRepository extends FluxObject<OCIRepositoryInterface> {
  static apiVersion = 'v1beta2';
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
