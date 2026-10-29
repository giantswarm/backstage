/**
 * The syncs the person started on this page load (see {@link AwaitedSync}),
 * kept in the plugin's query cache by workspace row id: written by the writes,
 * read by the list and the workspace's page, and forgotten once a read shows
 * them ended.
 */

import type { QueryClient } from '@tanstack/react-query';

import { musterWorkspaceSyncsAwaitedQueryKey } from './queryKeys';
import { isAwaiting, workspaceRowId, type AwaitedSync } from './workspaceList';
import type { Workspace } from './workspaceManager';

export type AwaitedSyncs = Record<string, AwaitedSync>;

export const NO_AWAITED_SYNCS: AwaitedSyncs = {};

/** The syncs recorded now, by workspace row id. */
export function awaitedSyncs(queryClient: QueryClient): AwaitedSyncs {
  return (
    queryClient.getQueryData<AwaitedSyncs>(
      musterWorkspaceSyncsAwaitedQueryKey(),
    ) ?? NO_AWAITED_SYNCS
  );
}

/**
 * Records a sync the person started on a workspace, or with `undefined`
 * forgets it: the list and the workspace's page say Synchronizing, and read
 * again, until a read shows it ended.
 */
export function awaitSync(
  queryClient: QueryClient,
  installation: string,
  name: string,
  awaited: AwaitedSync | undefined,
) {
  const id = workspaceRowId({ installation, name });
  queryClient.setQueryData<AwaitedSyncs>(
    musterWorkspaceSyncsAwaitedQueryKey(),
    (syncs = NO_AWAITED_SYNCS) => {
      const { [id]: _forgotten, ...rest } = syncs;
      return awaited ? { ...rest, [id]: awaited } : rest;
    },
  );
}

/**
 * Forgets the syncs a read of the installation's workspaces shows ended, or
 * that are no longer expected.
 */
export function forgetEndedSyncs(
  queryClient: QueryClient,
  installation: string,
  workspaces: Workspace[],
) {
  const syncs = awaitedSyncs(queryClient);
  for (const workspace of workspaces) {
    const awaited = syncs[workspaceRowId({ installation, ...workspace })];
    if (awaited && !isAwaiting(workspace, awaited)) {
      awaitSync(queryClient, installation, workspace.name, undefined);
    }
  }
}
