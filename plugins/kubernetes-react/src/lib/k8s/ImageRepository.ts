import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type ImageRepositoryInterface = crds.fluxcd.v1.ImageRepository;

export class ImageRepository extends FluxObject<ImageRepositoryInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'image.toolkit.fluxcd.io';
  static readonly kind = 'ImageRepository' as const;
  static readonly plural = 'imagerepositories';

  getImage() {
    return this.jsonData.spec?.image;
  }

  getProvider() {
    return this.jsonData.spec?.provider;
  }

  getLastScanResult() {
    return this.jsonData.status?.lastScanResult;
  }
}
