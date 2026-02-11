import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type ImageRepositoryV1Beta2 = crds.fluxcd.v1beta2.ImageRepository;
type ImageRepositoryV1 = crds.fluxcd.v1.ImageRepository;

type ImageRepositoryVersions = {
  v1beta2: ImageRepositoryV1Beta2;
  v1: ImageRepositoryV1;
};

type ImageRepositoryInterface =
  ImageRepositoryVersions[keyof ImageRepositoryVersions];

export class ImageRepository extends FluxObject<ImageRepositoryInterface> {
  static readonly supportedVersions = [
    'v1beta2',
    'v1',
  ] as const satisfies readonly (keyof ImageRepositoryVersions)[];
  static readonly group = 'image.toolkit.fluxcd.io';
  static readonly kind = 'ImageRepository' as const;
  static readonly plural = 'imagerepositories';

  /**
   * Type guard to check if this resource is v1beta2.
   */
  isV1Beta2(): this is ImageRepository & { jsonData: ImageRepositoryV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

  /**
   * Type guard to check if this resource is v1.
   */
  isV1(): this is ImageRepository & { jsonData: ImageRepositoryV1 } {
    return this.getApiVersionSuffix() === 'v1';
  }

  getImage() {
    return this.jsonData.spec?.image;
  }

  getProvider() {
    return this.jsonData.spec?.provider;
  }

  getInterval() {
    return this.jsonData.spec?.interval;
  }

  getLastScanResult() {
    return this.jsonData.status?.lastScanResult;
  }
}
