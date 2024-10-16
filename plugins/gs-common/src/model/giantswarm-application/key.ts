import * as v1alpha1 from './v1alpha1';

export const AppKind = 'App';
export const AppApiGroup = 'application.giantswarm.io';
export const AppNames = {
  plural: 'apps',
  singular: 'app',
};

export function getAppGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1alpha1.AppGVK;
  }

  switch (apiVersion) {
    case v1alpha1.AppApiVersion:
      return v1alpha1.AppGVK;
    default:
      return undefined;
  }
}
