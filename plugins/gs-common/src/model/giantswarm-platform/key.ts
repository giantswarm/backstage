import * as v1beta1 from './v1beta1';

export const GitHubAppKind = 'GitHubApp';
export const GitHubAppApiGroup = 'promise.platform.giantswarm.io';
export const GitHubAppNames = {
  plural: 'githubapps',
  singular: 'githubapp',
};

export function getGitHubAppGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.GitHubAppGVK;
  }

  switch (apiVersion) {
    case v1beta1.GitHubAppApiVersion:
      return v1beta1.GitHubAppGVK;
    default:
      return undefined;
  }
}

export const GitHubRepoKind = 'GitHubRepo';
export const GitHubRepoApiGroup = 'promise.platform.giantswarm.io';
export const GitHubRepoNames = {
  plural: 'githubrepos',
  singular: 'githubrepo',
};

export function getGitHubRepoGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.GitHubRepoGVK;
  }

  switch (apiVersion) {
    case v1beta1.GitHubRepoApiVersion:
      return v1beta1.GitHubRepoGVK;
    default:
      return undefined;
  }
}

export const AppDeploymentKind = 'AppDeployment';
export const AppDeploymentApiGroup = 'promise.platform.giantswarm.io';
export const AppDeploymentNames = {
  plural: 'appdeployments',
  singular: 'appdeployment',
};

export function getAppDeploymentGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.AppDeploymentGVK;
  }

  switch (apiVersion) {
    case v1beta1.AppDeploymentApiVersion:
      return v1beta1.AppDeploymentGVK;
    default:
      return undefined;
  }
}
