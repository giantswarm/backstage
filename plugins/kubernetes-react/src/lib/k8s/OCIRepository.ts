import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type OCIRepositoryV1Beta2 = crds.fluxcd.v1beta2.OCIRepository;
type OCIRepositoryV1 = crds.fluxcd.v1.OCIRepository;

type OCIRepositoryVersions = {
  v1beta2: OCIRepositoryV1Beta2;
  v1: OCIRepositoryV1;
};

type OCIRepositoryInterface =
  OCIRepositoryVersions[keyof OCIRepositoryVersions];

export class OCIRepository extends FluxObject<OCIRepositoryInterface> {
  static readonly supportedVersions = [
    'v1beta2',
    'v1',
  ] as const satisfies readonly (keyof OCIRepositoryVersions)[];
  static readonly group = 'source.toolkit.fluxcd.io';
  static readonly kind = 'OCIRepository' as const;
  static readonly plural = 'ocirepositories';

  /**
   * Type guard to check if this OCIRepository is v1beta2.
   */
  isV1Beta2(): this is OCIRepository & { jsonData: OCIRepositoryV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

  /**
   * Type guard to check if this OCIRepository is v1.
   */
  isV1(): this is OCIRepository & { jsonData: OCIRepositoryV1 } {
    return this.getApiVersionSuffix() === 'v1';
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

  getInterval() {
    return this.jsonData.spec?.interval;
  }

  getTimeout() {
    return this.jsonData.spec?.timeout;
  }
}
