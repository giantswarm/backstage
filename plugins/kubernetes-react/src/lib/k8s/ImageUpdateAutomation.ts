import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type ImageUpdateAutomationInterface = crds.fluxcd.v1.ImageUpdateAutomation;

export class ImageUpdateAutomation extends FluxObject<ImageUpdateAutomationInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'image.toolkit.fluxcd.io';
  static readonly kind = 'ImageUpdateAutomation' as const;
  static readonly plural = 'imageupdateautomations';

  getSourceRef() {
    return this.jsonData.spec?.sourceRef;
  }

  getUpdateConfig() {
    return this.jsonData.spec?.update;
  }

  getGit() {
    return this.jsonData.spec?.git;
  }

  getLastAutomationRunTime() {
    return this.jsonData.status?.lastAutomationRunTime;
  }
}
