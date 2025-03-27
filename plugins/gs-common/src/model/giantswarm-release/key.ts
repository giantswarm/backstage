import * as v1alpha1 from './v1alpha1';

export const ReleaseKind = 'Release';
export const ReleaseApiGroup = 'release.giantswarm.io';
export const ReleaseNames = {
  plural: 'releases',
  singular: 'release',
};

export function getReleaseGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1alpha1.ReleaseGVK;
  }

  switch (apiVersion) {
    case v1alpha1.ReleaseApiVersion:
      return v1alpha1.ReleaseGVK;
    default:
      return undefined;
  }
}
