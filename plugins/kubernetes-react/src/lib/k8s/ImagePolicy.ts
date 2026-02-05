import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type ImagePolicyV1Beta2 = crds.fluxcd.v1beta2.ImagePolicy;
type ImagePolicyV1 = crds.fluxcd.v1.ImagePolicy;

type ImagePolicyVersions = {
  v1beta2: ImagePolicyV1Beta2;
  v1: ImagePolicyV1;
};

type ImagePolicyInterface = ImagePolicyVersions[keyof ImagePolicyVersions];

export class ImagePolicy extends FluxObject<ImagePolicyInterface> {
  static readonly supportedVersions = [
    'v1beta2',
    'v1',
  ] as const satisfies readonly (keyof ImagePolicyVersions)[];
  static readonly group = 'image.toolkit.fluxcd.io';
  static readonly kind = 'ImagePolicy' as const;
  static readonly plural = 'imagepolicies';

  /**
   * Type guard to check if this resource is v1beta2.
   */
  isV1Beta2(): this is ImagePolicy & { jsonData: ImagePolicyV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

  /**
   * Type guard to check if this resource is v1.
   */
  isV1(): this is ImagePolicy & { jsonData: ImagePolicyV1 } {
    return this.getApiVersionSuffix() === 'v1';
  }

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
