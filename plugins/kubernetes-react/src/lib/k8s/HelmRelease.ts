import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface HelmReleaseInterface extends KubeObjectInterface {
  spec?: {};
  status?: {};
}

export class HelmRelease extends KubeObject<HelmReleaseInterface> {
  static apiVersion = 'v2beta1';
  static group = 'helm.toolkit.fluxcd.io';
  static kind = 'HelmRelease' as const;
  static plural = 'helmreleases';
}
