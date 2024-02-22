import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';

export const appGVK: CustomResourceMatcher = {
  apiVersion: 'v1alpha1',
  group: 'application.giantswarm.io',
  plural: 'apps',
};

export const clusterGVK: CustomResourceMatcher = {
  apiVersion: 'v1beta1',
  group: 'cluster.x-k8s.io',
  plural: 'clusters',
};

export const helmReleaseGVK: CustomResourceMatcher = {
  apiVersion: 'v2beta1',
  group: 'helm.toolkit.fluxcd.io',
  plural: 'helmreleases',
};
