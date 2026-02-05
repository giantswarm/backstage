import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type ImagePolicyInterface = crds.fluxcd.v1.ImagePolicy;

export class ImagePolicy extends FluxObject<ImagePolicyInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'image.toolkit.fluxcd.io';
  static readonly kind = 'ImagePolicy' as const;
  static readonly plural = 'imagepolicies';

  getImageRepositoryRef() {
    return this.jsonData.spec?.imageRepositoryRef;
  }

  getLatestRef() {
    return this.jsonData.status?.latestRef;
  }

  getLatestImage() {
    const latestRef = this.jsonData.status?.latestRef;
    if (!latestRef) {
      return undefined;
    }
    return `${latestRef.name}:${latestRef.tag}`;
  }

  getPolicy() {
    return this.jsonData.spec?.policy;
  }
}
