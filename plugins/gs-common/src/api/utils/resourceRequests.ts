import * as giantswarmPlatform from '../../model/giantswarm-platform';
import { ResourceRequest } from '../types';

export const ResourceRequestStatuses = {
  Unknown: 'unknown',
  Pending: 'pending',
  Failed: 'failed',
  Completed: 'completed',
} as const;

export function getResourceRequestNames(singular: string) {
  let names;
  switch (singular) {
    case 'githubapp':
      names = giantswarmPlatform.GitHubAppNames;
      break;
    case 'githubrepo':
      names = giantswarmPlatform.GitHubRepoNames;
      break;
    case 'appdeployment':
      names = giantswarmPlatform.AppDeploymentNames;
      break;
    default:
      throw new Error(`${singular} is not a supported resource request kind.`);
  }

  return names;
}

export function getResourceRequestGVK(singular: string, apiVersion?: string) {
  let gvk;
  let kind;
  switch (singular) {
    case 'githubapp':
      gvk = getGitHubAppGVK(apiVersion);
      kind = giantswarmPlatform.GitHubAppKind;
      break;
    case 'githubrepo':
      gvk = getGitHubRepoGVK(apiVersion);
      kind = giantswarmPlatform.GitHubRepoKind;
      break;
    case 'appdeployment':
      gvk = getAppDeploymentGVK(apiVersion);
      kind = giantswarmPlatform.AppDeploymentKind;
      break;
    default:
      throw new Error(`${singular} is not a supported resource request kind.`);
  }

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getGitHubAppGVK(apiVersion?: string) {
  return giantswarmPlatform.getGitHubAppGVK(apiVersion);
}

export function getGitHubRepoGVK(apiVersion?: string) {
  return giantswarmPlatform.getGitHubRepoGVK(apiVersion);
}

export function getAppDeploymentGVK(apiVersion?: string) {
  return giantswarmPlatform.getAppDeploymentGVK(apiVersion);
}

export function getResourceRequestStatus(resourceRequest: ResourceRequest) {
  if (!resourceRequest.status || !resourceRequest.status.conditions) {
    return undefined;
  }
  const conditions = resourceRequest.status?.conditions;

  if (
    conditions.some(
      c =>
        c.type === 'PipelineCompleted' &&
        c.reason === 'PipelineNotCompleted' &&
        c.status === 'False',
    )
  ) {
    return ResourceRequestStatuses.Pending;
  }

  if (
    conditions.some(
      c =>
        c.type === 'PipelineCompleted' &&
        c.reason === 'PipelineExecutedSuccessfully' &&
        c.status === 'True',
    )
  ) {
    return ResourceRequestStatuses.Completed;
  }

  return ResourceRequestStatuses.Unknown;
}

export function getResourceRequestStatusMessage(
  resourceRequest: ResourceRequest,
) {
  return resourceRequest.status?.message ?? '';
}
