import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type HelmRepositoryInterface = crds.fluxcd.v1.HelmRepository;

export class HelmRepository extends FluxObject<HelmRepositoryInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'source.toolkit.fluxcd.io';
  static readonly kind = 'HelmRepository' as const;
  static readonly plural = 'helmrepositories';

  getURL() {
    return this.jsonData.spec?.url;
  }

  getRevision() {
    return this.jsonData.status?.artifact?.revision;
  }

  getInterval() {
    return this.jsonData.spec?.interval;
  }

  getTimeout() {
    return this.jsonData.spec?.timeout;
  }
}
