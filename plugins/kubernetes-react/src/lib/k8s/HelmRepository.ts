import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type HelmRepositoryV1Beta2 = crds.fluxcd.v1beta2.HelmRepository;
type HelmRepositoryV1 = crds.fluxcd.v1.HelmRepository;

type HelmRepositoryVersions = {
  v1beta2: HelmRepositoryV1Beta2;
  v1: HelmRepositoryV1;
};

type HelmRepositoryInterface =
  HelmRepositoryVersions[keyof HelmRepositoryVersions];

export class HelmRepository extends FluxObject<HelmRepositoryInterface> {
  static readonly supportedVersions = [
    'v1beta2',
    'v1',
  ] as const satisfies readonly (keyof HelmRepositoryVersions)[];
  static readonly group = 'source.toolkit.fluxcd.io';
  static readonly kind = 'HelmRepository' as const;
  static readonly plural = 'helmrepositories';

  /**
   * Type guard to check if this HelmRepository is v1beta2.
   */
  isV1Beta2(): this is HelmRepository & { jsonData: HelmRepositoryV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

  /**
   * Type guard to check if this HelmRepository is v1.
   */
  isV1(): this is HelmRepository & { jsonData: HelmRepositoryV1 } {
    return this.getApiVersionSuffix() === 'v1';
  }

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
