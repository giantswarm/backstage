import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type OCIRepositoryInterface = crds.fluxcd.v1beta2.OCIRepository;

export class OCIRepository extends FluxObject<OCIRepositoryInterface> {
  static readonly supportedVersions = ['v1beta2'] as const;
  static readonly group = 'source.toolkit.fluxcd.io';
  static readonly kind = 'OCIRepository' as const;
  static readonly plural = 'ocirepositories';

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
