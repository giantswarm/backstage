import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { useWorkspaceManagerClient } from './useWorkspaceManager';
import {
  musterWorkspaceQueryKey,
  musterWorkspacesQueryKey,
} from '../lib/queryKeys';
import {
  WorkspaceManagerError,
  type DeleteWorkspaceResult,
  type SyncWorkspaceResult,
  type WorkspaceDetail,
} from '../lib/workspaceManager';

/**
 * One workspace with its storage and Session directories (`get_workspace`),
 * as the person, read afresh each time it is `enabled`: what it says is
 * acted on.
 */
export function useWorkspaceDetail(
  installation: string,
  name: string,
  enabled: boolean = true,
) {
  const client = useWorkspaceManagerClient(installation);
  return useQuery<WorkspaceDetail>({
    queryKey: musterWorkspaceQueryKey(installation, name),
    enabled: enabled && Boolean(client),
    queryFn: () => client!.getWorkspace(name),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Sync now and Delete on one workspace, as the person. Each re-reads the
 * installation's list, which shows the requested sync or the deletion, without
 * waiting for it: the caller's own success follows the answer at once.
 */
export function useWorkspaceActions(installation: string, name: string) {
  const client = useWorkspaceManagerClient(installation);
  const queryClient = useQueryClient();
  const reread = () => {
    void queryClient.invalidateQueries({
      queryKey: musterWorkspacesQueryKey(installation),
      exact: true,
    });
    void queryClient.invalidateQueries({
      queryKey: musterWorkspaceQueryKey(installation, name),
    });
  };
  const requireClient = () => {
    if (!client) {
      throw new WorkspaceManagerError(
        'unavailable',
        'The workspace-manager cannot be reached from this portal.',
      );
    }
    return client;
  };

  const sync = useTrackedMutation<SyncWorkspaceResult, Error, void>({
    event: null,
    untrackedReason:
      'Housekeeping on a workspace; workspaces are measured at their creation.',
    mutationFn: () => requireClient().syncWorkspace(name),
    onSuccess: reread,
  });

  const remove = useTrackedMutation<DeleteWorkspaceResult, Error, void>({
    event: null,
    untrackedReason:
      'Housekeeping on a workspace; workspaces are measured at their creation.',
    mutationFn: () => requireClient().deleteWorkspace(name),
    onSuccess: reread,
  });

  return { sync, remove };
}
