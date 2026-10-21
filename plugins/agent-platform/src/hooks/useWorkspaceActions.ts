import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { useWorkspaceManagerClient } from './useWorkspaceManager';
import {
  musterWorkspaceQueryKey,
  musterWorkspacesQueryKey,
} from '../lib/queryKeys';
import { lastPushes } from '../lib/workspaceDetail';
import { isSettling } from '../lib/workspaceList';
import {
  WorkspaceManagerError,
  type DeleteWorkspaceResult,
  type SyncWorkspaceResult,
  type WorkspaceDetail,
  type WorkspacePreview,
} from '../lib/workspaceManager';

/** How often a workspace whose sync runs or waits is read again. */
const SETTLING_REFETCH_MS = 5000;

/** The most `preview_workspace` pages read for the repositories' last pushes. */
const MAX_PUSH_PAGES = 10;

/** `preview_workspace`'s largest page. */
const PUSH_PAGE_SIZE = 200;

/**
 * One workspace with its storage and Session directories (`get_workspace`),
 * as the person, read afresh each time it is `enabled`: what it says is
 * acted on. With `followSync`, read again while a sync runs or waits, until
 * it ends.
 */
export function useWorkspaceDetail(
  installation: string,
  name: string,
  enabled: boolean = true,
  { followSync = false }: { followSync?: boolean } = {},
) {
  const client = useWorkspaceManagerClient(installation);
  return useQuery<WorkspaceDetail>({
    queryKey: musterWorkspaceQueryKey(installation, name),
    enabled: enabled && Boolean(client),
    queryFn: () => client!.getWorkspace(name),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: query =>
      followSync && query.state.data && isSettling(query.state.data.workspace)
        ? SETTLING_REFETCH_MS
        : false,
  });
}

/**
 * The last push of each repository the workspace selects now, as its
 * providers list it to the person (`preview_workspace`, paged), by
 * `mirrorKey`: what tells a mirror pushed to since the last sync. Read once
 * per last sync; a person who cannot read the providers gets the error, and
 * the page marks nothing.
 */
export function useWorkspaceLastPushes(
  installation: string,
  name: string,
  lastSyncTime: string | undefined,
  enabled: boolean,
) {
  const client = useWorkspaceManagerClient(installation);
  return useQuery<Map<string, string>>({
    queryKey: [
      ...musterWorkspaceQueryKey(installation, name),
      'last-pushes',
      lastSyncTime ?? '',
    ],
    enabled: enabled && Boolean(client),
    queryFn: async () => {
      const pages: WorkspacePreview[] = [];
      for (let page = 1; page <= MAX_PUSH_PAGES; page++) {
        const preview = await client!.previewWorkspace({
          workspace: name,
          page,
          pageSize: PUSH_PAGE_SIZE,
        });
        pages.push(preview);
        if (page * PUSH_PAGE_SIZE >= preview.matching) {
          break;
        }
      }
      return lastPushes(pages);
    },
    retry: false,
    staleTime: Infinity,
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
