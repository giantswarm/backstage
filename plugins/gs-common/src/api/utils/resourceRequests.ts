import * as promisev1beta1 from '../../model/promisev1beta1';
import { ResourceRequest } from '../types';

export const ResourceRequestStatuses = {
  Unknown: 'unknown',
  Pending: 'pending',
  Failed: 'failed',
  Completed: 'completed',
} as const;

export function getGitHubAppGVK(apiVersion?: string) {
  switch (apiVersion) {
    case promisev1beta1.githubAppApiVersion:
      return promisev1beta1.githubAppGVK;
    default:
      return promisev1beta1.githubAppGVK;
  }
}

export function getGitHubRepoGVK(apiVersion?: string) {
  switch (apiVersion) {
    case promisev1beta1.githubRepoApiVersion:
      return promisev1beta1.githubRepoGVK;
    default:
      return promisev1beta1.githubRepoGVK;
  }
}

export function getAppDeploymentGVK(apiVersion?: string) {
  switch (apiVersion) {
    case promisev1beta1.appDeploymentApiVersion:
      return promisev1beta1.appDeploymentGVK;
    default:
      return promisev1beta1.appDeploymentGVK;
  }
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
