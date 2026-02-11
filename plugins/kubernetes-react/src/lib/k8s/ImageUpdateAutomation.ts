import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type ImageUpdateAutomationV1Beta2 = crds.fluxcd.v1beta2.ImageUpdateAutomation;
type ImageUpdateAutomationV1 = crds.fluxcd.v1.ImageUpdateAutomation;

type ImageUpdateAutomationVersions = {
  v1beta2: ImageUpdateAutomationV1Beta2;
  v1: ImageUpdateAutomationV1;
};

type ImageUpdateAutomationInterface =
  ImageUpdateAutomationVersions[keyof ImageUpdateAutomationVersions];

export class ImageUpdateAutomation extends FluxObject<ImageUpdateAutomationInterface> {
  static readonly supportedVersions = [
    'v1beta2',
    'v1',
  ] as const satisfies readonly (keyof ImageUpdateAutomationVersions)[];
  static readonly group = 'image.toolkit.fluxcd.io';
  static readonly kind = 'ImageUpdateAutomation' as const;
  static readonly plural = 'imageupdateautomations';

  /**
   * Type guard to check if this resource is v1beta2.
   */
  isV1Beta2(): this is ImageUpdateAutomation & {
    jsonData: ImageUpdateAutomationV1Beta2;
  } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

  /**
   * Type guard to check if this resource is v1.
   */
  isV1(): this is ImageUpdateAutomation & {
    jsonData: ImageUpdateAutomationV1;
  } {
    return this.getApiVersionSuffix() === 'v1';
  }

  getSourceRef() {
    return this.jsonData.spec?.sourceRef;
  }

  getUpdateConfig() {
    return this.jsonData.spec?.update;
  }

  getGit() {
    return this.jsonData.spec?.git;
  }

  getInterval() {
    return this.jsonData.spec?.interval;
  }

  getLastAutomationRunTime() {
    return this.jsonData.status?.lastAutomationRunTime;
  }
}
