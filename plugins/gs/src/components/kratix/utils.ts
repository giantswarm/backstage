import { ResourceRequest } from '@giantswarm/backstage-plugin-kubernetes-react';

export const ResourceRequestStatuses = {
  Unknown: 'unknown',
  Pending: 'pending',
  Failed: 'failed',
  Completed: 'completed',
} as const;

export function getResourceRequestStatus(resourceRequest: ResourceRequest) {
  const conditions = resourceRequest.getStatusConditions();
  if (!conditions) {
    return undefined;
  }

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
  return resourceRequest.getStatus()?.message ?? '';
}
