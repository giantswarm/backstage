import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { useWorkspaceManagerClient } from './useWorkspaceManager';
import {
  musterWorkspaceLastPushesQueryKey,
  musterWorkspaceQueryKey,
  musterWorkspacesQueryKey,
  musterWorkspaceSyncsAwaitedQueryKey,
} from '../lib/queryKeys';
import { lastPushes, type LastPushes } from '../lib/workspaceDetail';
import {
  awaitedSyncs,
  awaitSync,
  forgetEndedSyncs,
  NO_AWAITED_SYNCS,
  type AwaitedSyncs,
} from '../lib/awaitedSyncs';
import {
  syncRefetchInterval,
  workspaceRowId,
  type AwaitedSync,
} from '../lib/workspaceList';
import {
  WorkspaceManagerError,
  type DeleteWorkspaceResult,
  type SyncWorkspaceResult,
  type WorkspaceDetail,
  type WorkspaceList,
} from '../lib/workspaceManager';

/** The syncs the person started on this page load, by workspace row id. */
export function useAwaitedSyncs(): AwaitedSyncs {
  const queryClient = useQueryClient();
  // Subscribing through useQuery re-renders the reader when a write records
  // one.
  const { data } = useQuery<AwaitedSyncs>({
    queryKey: musterWorkspaceSyncsAwaitedQueryKey(),
    // Cache-only: nothing fetches this, awaitSync owns it.
    queryFn: () => awaitedSyncs(queryClient),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? NO_AWAITED_SYNCS;
}

/** The sync the person started on one workspace, while it is recorded. */
export function useAwaitedSync(
  installation: string,
  name: string,
): AwaitedSync | undefined {
  return useAwaitedSyncs()[workspaceRowId({ installation, name })];
}

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
 * acted on. Each read also replaces the workspace's row in the installation's
 * list, so the list is never behind what the page showed. With `followSync`,
 * read again while its sync is under way, as `syncState` says (not for the
 * whole of a deletion, which lasts until the last Session directory is
 * cleaned up): not while the tab is hidden, and once more on coming back to it.
 */
export function useWorkspaceDetail(
  installation: string,
  name: string,
  enabled: boolean = true,
  { followSync = false }: { followSync?: boolean } = {},
) {
  const client = useWorkspaceManagerClient(installation);
  const queryClient = useQueryClient();
  // Read when the interval is, not subscribed to: a reader that does not
  // follow the sync must not re-render for every sync recorded. The page that
  // follows it subscribes itself (useAwaitedSync), which re-evaluates this.
  const refetchInterval = (data: WorkspaceDetail | undefined) =>
    followSync && data
      ? syncRefetchInterval(
          data.workspace,
          awaitedSyncs(queryClient)[workspaceRowId({ installation, name })],
        )
      : false;
  return useQuery<WorkspaceDetail>({
    queryKey: musterWorkspaceQueryKey(installation, name),
    enabled: enabled && Boolean(client),
    queryFn: async () => {
      const detail = await client!.getWorkspace(name);
      forgetEndedSyncs(queryClient, installation, [detail.workspace]);
      queryClient.setQueryData<WorkspaceList>(
        musterWorkspacesQueryKey(installation),
        list =>
          list && {
            ...list,
            workspaces: list.workspaces.map(workspace =>
              workspace.name === name ? detail.workspace : workspace,
            ),
          },
      );
      return detail;
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: query => refetchInterval(query.state.data),
    refetchOnWindowFocus: query =>
      refetchInterval(query.state.data) ? 'always' : false,
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
 * waiting for it: the caller's own success follows the answer at once. Sync
 * records the sync as awaited as it is asked for, after the last sync the
 * caller knows (`after`), so the row and the page say Synchronizing from the
 * click on; a refusal forgets it.
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

  const sync = useTrackedMutation<
    SyncWorkspaceResult,
    Error,
    { after: string }
  >({
    event: null,
    untrackedReason:
      'Housekeeping on a workspace; workspaces are measured at their creation.',
    mutationFn: () => requireClient().syncWorkspace(name),
    onMutate: ({ after }) =>
      awaitSync(queryClient, installation, name, {
        cause: 'requested',
        after,
        since: Date.now(),
      }),
    onError: () => awaitSync(queryClient, installation, name, undefined),
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
