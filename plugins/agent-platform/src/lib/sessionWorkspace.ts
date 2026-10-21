/**
 * What a session's header, the sessions list and the rail say about the
 * workspace the session works in.
 */

import type { SessionWorkspaceName } from '../hooks/useWorkspaceNames';
import { shortAge } from './shortAge';

/** Said for a session's workspace the person cannot see by name. */
export const UNNAMED_WORKSPACE_LABEL = 'workspace';

/** Why a session's workspace has no name, for its tooltip and drawer. */
export const UNNAMED_WORKSPACE_REASON =
  'This workspace is not listed for you any more: it was deleted, or you are no longer a member of its Organization. The session works as before.';

/**
 * The workspace's name, or the unnamed form; undefined while it is read and
 * for a session without a workspace.
 */
export function workspaceNameLabel(
  name: SessionWorkspaceName | undefined,
): string | undefined {
  switch (name?.status) {
    case 'named':
      return name.workspace.name;
    case 'unnamed':
      return UNNAMED_WORKSPACE_LABEL;
    default:
      return undefined;
  }
}

/** "synced 3 h ago", as the composer's workspace picker says it. */
export function syncedAgo(time: string | undefined, now = new Date()): string {
  const age = shortAge(time, now);
  if (!age) {
    return 'not synced yet';
  }
  return age === 'now' ? 'synced now' : `synced ${age} ago`;
}

/** "1 fetched": the repositories fetched fresh before the first turn. */
export function fetchedLabel(fetched: number): string {
  return `${fetched} fetched`;
}

/**
 * The header chip's words: the workspace's name, its last sync and how many
 * repositories were fetched fresh at the start. The unnamed form has no sync
 * to tell.
 */
export function workspaceChipLabel(
  name: SessionWorkspaceName,
  fetched: number,
  now = new Date(),
): string {
  if (name.status === 'named') {
    return [
      name.workspace.name,
      syncedAgo(name.workspace.lastSync?.time, now),
      fetchedLabel(fetched),
    ].join(' · ');
  }
  return ['Workspace', fetchedLabel(fetched)].join(' · ');
}
