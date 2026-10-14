import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { useWorkspaceManagerClient } from './useWorkspaceManager';
import {
  musterWorkspaceQueryKey,
  musterWorkspacesQueryKey,
} from '../lib/queryKeys';
import {
  classifyWorkspaceManagerError,
  type DeleteWorkspaceResult,
  type SyncWorkspaceResult,
  type WorkspaceDetail,
} from '../lib/workspaceManager';

/**
 * One workspace with its storage and Session directories (`get_workspace`),
 * as the person; read only while `enabled`.
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
    queryFn: async () => {
      try {
        return await client!.getWorkspace(name);
      } catch (error) {
        throw classifyWorkspaceManagerError(error);
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Sync now and Delete on one workspace, as the person. Each re-reads the
 * installation's list, which shows the requested sync or the deletion.
 */
export function useWorkspaceActions(installation: string, name: string) {
  const client = useWorkspaceManagerClient(installation);
  const queryClient = useQueryClient();
  const reread = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: musterWorkspacesQueryKey(installation),
      }),
      queryClient.invalidateQueries({
        queryKey: musterWorkspaceQueryKey(installation, name),
      }),
    ]);
  const requireClient = () => {
    if (!client) {
      throw new Error(
        'The workspace-manager cannot be reached from this portal.',
      );
    }
    return client;
  };

  const sync = useTrackedMutation<SyncWorkspaceResult, Error, void>({
    event: null,
    untrackedReason:
      'Housekeeping on a workspace; workspaces are measured at their creation.',
    mutationFn: async () => {
      try {
        return await requireClient().syncWorkspace(name);
      } catch (error) {
        throw classifyWorkspaceManagerError(error);
      }
    },
    onSuccess: reread,
  });

  const remove = useTrackedMutation<DeleteWorkspaceResult, Error, void>({
    event: null,
    untrackedReason:
      'Housekeeping on a workspace; workspaces are measured at their creation.',
    mutationFn: async () => {
      try {
        return await requireClient().deleteWorkspace(name);
      } catch (error) {
        throw classifyWorkspaceManagerError(error);
      }
    },
    onSuccess: reread,
  });

  return { sync, remove };
}
