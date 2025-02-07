import * as v1 from './v1';
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

export const KustomizationKind = 'Kustomization';
export const KustomizationApiGroup = 'kustomize.toolkit.fluxcd.io';
export const KustomizationNames = {
  plural: 'kustomizations',
  singular: 'kustomization',
};

export function getKustomizationGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1.KustomizationGVK;
  }

  switch (apiVersion) {
    case v1.KustomizationApiVersion:
      return v1.KustomizationGVK;
    default:
      return undefined;
  }
}

export const GitRepositoryKind = 'GitRepository';
export const GitRepositoryApiGroup = 'source.toolkit.fluxcd.io';
export const GitRepositoryNames = {
  plural: 'gitrepositories',
  singular: 'gitrepository',
};

export function getGitRepositoryGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1.GitRepositoryGVK;
  }

  switch (apiVersion) {
    case v1.GitRepositoryApiVersion:
      return v1.GitRepositoryGVK;
    default:
      return undefined;
  }
}
