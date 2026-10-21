import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { useWorkspaceManagerClient } from './useWorkspaceManager';
import {
  musterWorkspaceLastPushesQueryKey,
  musterWorkspaceQueryKey,
  musterWorkspacesQueryKey,
} from '../lib/queryKeys';
import { isSyncing, lastPushes, type LastPushes } from '../lib/workspaceDetail';
import {
  WorkspaceManagerError,
  type DeleteWorkspaceResult,
  type SyncWorkspaceResult,
  type WorkspaceDetail,
} from '../lib/workspaceManager';

/** How often a workspace whose sync runs or waits is read again. */
const SETTLING_REFETCH_MS = 5000;

/**
 * The most `preview_workspace` pages read for the repositories' last pushes:
 * 5,000 repositories; the page says when a workspace selects more.
 */
const MAX_PUSH_PAGES = 25;

/** `preview_workspace`'s largest page. */
const PUSH_PAGE_SIZE = 200;

/**
 * One workspace with its storage and Session directories (`get_workspace`),
 * as the person, read afresh each time it is `enabled`: what it says is
 * acted on. With `followSync`, read again while a sync runs or waits (not
 * for the whole of a deletion, which lasts until the last Session directory
 * is cleaned up), and while `awaitingSync` (a requested sync the read does not
 * show ended yet), in a background tab too: the end of a sync the person
 * asked for is shown whenever they look.
 */
export function useWorkspaceDetail(
  installation: string,
  name: string,
  enabled: boolean = true,
  {
    followSync = false,
    awaitingSync = false,
  }: { followSync?: boolean; awaitingSync?: boolean } = {},
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
      followSync &&
      (awaitingSync ||
        (query.state.data && isSyncing(query.state.data.workspace)))
        ? SETTLING_REFETCH_MS
        : false,
    refetchIntervalInBackground: followSync,
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
  return useQuery<LastPushes>({
    queryKey: musterWorkspaceLastPushesQueryKey(
      installation,
      name,
      lastSyncTime ?? '',
    ),
    enabled: enabled && Boolean(client),
    queryFn: async () => {
      const page = (n: number) =>
        client!.previewWorkspace({
          workspace: name,
          page: n,
          pageSize: PUSH_PAGE_SIZE,
        });
      // The first page says how many there are; the rest are read at once.
      const first = await page(1);
      const pageCount = Math.ceil(first.matching / PUSH_PAGE_SIZE);
      const rest = await Promise.all(
        Array.from(
          { length: Math.min(pageCount, MAX_PUSH_PAGES) - 1 },
          (_, i) => page(i + 2),
        ),
      );
      return lastPushes([first, ...rest], pageCount > MAX_PUSH_PAGES);
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
