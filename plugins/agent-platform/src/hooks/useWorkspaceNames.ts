import { useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { WorkspaceManagerClient } from '../apis/WorkspaceManagerClient';
import { musterWorkspacesQueryKey } from '../lib/queryKeys';
import {
  WORKSPACE_MANAGER_SERVER,
  type Workspace,
} from '../lib/workspaceManager';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useMusterServerAvailability } from './useMusterServerAvailability';

/**
 * A session's workspace as the person can see it: `named` with the workspace
 * workspace-manager lists for the session's volume, `unnamed` where no listed
 * workspace has that volume (a deleted workspace, one of an Organization the
 * person has left, an installation whose workspace-manager cannot be read),
 * `loading` while the list is read.
 */
export type SessionWorkspaceName =
  | { status: 'loading' }
  | { status: 'named'; workspace: Workspace }
  | { status: 'unnamed' };

const LOADING: SessionWorkspaceName = { status: 'loading' };
const UNNAMED: SessionWorkspaceName = { status: 'unnamed' };

/**
 * Each installation's list by volume handle, or `loading`; a list that failed
 * or cannot be read is empty, which leaves its sessions unnamed. Stable, so
 * `useQueries` hands back the same array until a list changes.
 */
function combineLists(
  results: Array<{
    data?: { workspaces: Workspace[] };
    isPending: boolean;
    fetchStatus: string;
  }>,
): Array<Map<string, Workspace> | 'loading'> {
  return results.map(result => {
    if (result.isPending && result.fetchStatus !== 'idle') {
      return 'loading';
    }
    const byHandle = new Map<string, Workspace>();
    for (const workspace of result.data?.workspaces ?? []) {
      if (workspace.volume?.handle) {
        byHandle.set(workspace.volume.handle, workspace);
      }
    }
    return byHandle;
  });
}

/** What {@link useWorkspaceNames} resolves a session's workspace with. */
export type WorkspaceNameOf = (session: {
  installation: string;
  workspace?: { volumeHandle: string };
}) => SessionWorkspaceName | undefined;

/**
 * The workspaces of sessions on `installations`, by their volume's CSI handle:
 * one `list_workspaces` per installation as the person, the cache entry the
 * composer's picker and Customize · Workspaces read, never one call per
 * session. Only the installations given are read: a caller passes those of its
 * sessions with a workspace, so a list without one costs nothing. The resolver
 * answers `undefined` for a session without a workspace.
 */
export function useWorkspaceNames(installations: string[]): WorkspaceNameOf {
  const musterApi = useMusterPluginApi();
  const availability = useMusterServerAvailability(
    WORKSPACE_MANAGER_SERVER,
    installations,
  );
  const readable = installations.filter(
    installation => availability.presenceOf(installation) === 'available',
  );
  const readableKey = readable.join('|');
  const lists = useQueries({
    queries: readable.map(installation => ({
      queryKey: musterWorkspacesQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () =>
        new WorkspaceManagerClient(musterApi!, installation).listWorkspaces(),
      retry: false,
    })),
    combine: combineLists,
  });

  const byInstallation = useMemo(() => {
    const index = new Map<string, Map<string, Workspace> | 'loading'>();
    readableKey.split('|').forEach((installation, position) => {
      const list = lists[position];
      if (installation && list) {
        index.set(installation, list);
      }
    });
    return index;
  }, [readableKey, lists]);

  const isAvailabilityLoading = availability.isLoading;
  return useCallback(
    session => {
      if (!session.workspace) {
        return undefined;
      }
      const index = byInstallation.get(session.installation);
      if (index === 'loading') {
        return LOADING;
      }
      if (!index) {
        // Not (yet) known to list the workspace-manager.
        const presence = availability.presenceOf(session.installation);
        return presence === 'unknown' && isAvailabilityLoading
          ? LOADING
          : UNNAMED;
      }
      const workspace = index.get(session.workspace.volumeHandle);
      return workspace ? { status: 'named', workspace } : UNNAMED;
    },
    [byInstallation, availability, isAvailabilityLoading],
  );
}

/** The installations of the sessions given that work in a workspace, sorted. */
export function workspaceInstallations(
  sessions: ReadonlyArray<{ installation: string; workspace?: unknown }>,
): string[] {
  return Array.from(
    new Set(
      sessions
        .filter(session => session.workspace)
        .map(session => session.installation),
    ),
  ).sort();
}
