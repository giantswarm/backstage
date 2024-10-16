import * as v2beta1 from './v2beta1';

export const HelmReleaseKind = 'HelmRelease';
export const HelmReleaseApiGroup = 'helm.toolkit.fluxcd.io';
export const HelmReleaseNames = {
  plural: 'helmreleases',
  singular: 'helmrelease',
};

export function getHelmReleaseGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v2beta1.HelmReleaseGVK;
  }

  switch (apiVersion) {
    case v2beta1.HelmReleaseApiVersion:
      return v2beta1.HelmReleaseGVK;
    default:
      return undefined;
  }
}
