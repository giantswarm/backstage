import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useLocalStorageState from 'use-local-storage-state';

import { musterWorkspacesQueryKey } from '../lib/queryKeys';
import type { Workspace } from '../lib/workspaceManager';
import {
  useWorkspaceManagerAvailability,
  useWorkspaceManagerClient,
} from './useWorkspaceManager';

export type SessionWorkspaces = {
  /**
   * The workspaces a session on the installation can start in: every one of
   * the person's Organizations', but those being deleted, by name.
   */
  workspaces: Workspace[];
  /** The list has not answered yet. */
  isLoading: boolean;
};

/**
 * The workspaces of the person's Organizations on an agent's installation,
 * for the composer's workspace picker. Empty where the installation's muster
 * does not list the workspace-manager, while the person has not signed in to
 * it, or when the list fails: the picker is then not offered, and the session
 * starts as it always did. The same query as Customize · Workspaces.
 */
export function useSessionWorkspaces(installation: string): SessionWorkspaces {
  const availability = useWorkspaceManagerAvailability(installation);
  const client = useWorkspaceManagerClient(installation);
  const enabled = availability.isAvailable && Boolean(client);
  const list = useQuery({
    queryKey: musterWorkspacesQueryKey(installation),
    queryFn: () => client!.listWorkspaces(),
    enabled,
    retry: false,
  });
  const workspaces = useMemo(
    () =>
      (list.data?.workspaces ?? [])
        .filter(workspace => !workspace.deleting)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [list.data],
  );
  return {
    workspaces,
    isLoading: availability.isLoading || (enabled && list.isPending),
  };
}

/** Same `gs-` prefix as the last-used agent's. */
const STORAGE_KEY = 'gs-agent-platform-last-workspace';

/** What is remembered for an agent that last started without a workspace. */
const NO_WORKSPACE = '';

/**
 * The workspace last chosen with each agent, by the agent's row id, in this
 * browser: `undefined` for an agent never started from here, `null` for one
 * last started without a workspace. A remembered workspace that has gone is
 * the caller's to drop, as the composer does by offering only those listed.
 */
export function useLastWorkspace() {
  const [byAgent, setByAgent] = useLocalStorageState<Record<string, string>>(
    STORAGE_KEY,
    { defaultValue: {} },
  );
  const lastWorkspaceOf = useCallback(
    (agentId: string): string | null | undefined => {
      const value = byAgent[agentId];
      if (value === undefined) {
        return undefined;
      }
      return value === NO_WORKSPACE ? null : value;
    },
    [byAgent],
  );
  const rememberWorkspace = useCallback(
    (agentId: string, workspace: string | undefined) =>
      setByAgent(previous => ({
        ...previous,
        [agentId]: workspace ?? NO_WORKSPACE,
      })),
    [setByAgent],
  );
  return { lastWorkspaceOf, rememberWorkspace };
}
