/**
 * What a workspace's page says of it: its last sync, what started it, its
 * repositories and the Sessions with a directory on its volume, from
 * `get_workspace`.
 */

import { syncState, type SyncTone } from './workspaceList';
import type {
  LastSync,
  SessionDirectory,
  SyncTrigger,
  Workspace,
  WorkspaceMirror,
  WorkspacePreview,
} from './workspaceManager';

/**
 * What started a sync cycle, as the page says it. A Session's start past the
 * refresh threshold and Sync now both reach the manager as a request; the
 * manager records no schedule any more, but a cycle that ran at the upgrade
 * may still name it.
 */
export function syncTriggerLabel(trigger: SyncTrigger | string | undefined) {
  switch (trigger) {
    case 'change':
      return 'A change to the workspace';
    case 'request':
      return 'A request: Sync now, or a Session starting on it';
    case 'retry':
      return 'A retry after the failed sync before it';
    case 'cleanup':
      return 'A Session directory due for cleanup';
    case 'sessionDeleted':
      return 'A deleted Session’s directory';
    case 'deletion':
      return 'The workspace’s deletion';
    case 'schedule':
      return 'The old nightly schedule';
    case undefined:
    case '':
      return undefined;
    default:
      return trigger;
  }
}

/**
 * The last sync's result in a sentence: what it fetched, that it fetched
 * nothing, or why it failed in the manager's own words.
 */
export function lastSyncResult(last: LastSync): {
  label: string;
  tone: SyncTone;
  sentence: string;
} {
  switch (last.result) {
    case 'Succeeded':
      return {
        label: 'Synced',
        tone: 'success',
        sentence: 'Fetched what changed since the sync before.',
      };
    case 'NoChange':
      return {
        label: 'Unchanged',
        tone: 'success',
        sentence: 'Nothing had changed, so nothing was fetched.',
      };
    default:
      return {
        label: 'Failed',
        tone: 'danger',
        sentence: last.message
          ? `The mirrors stay as they were: ${last.message}`
          : 'The mirrors stay as they were; the workspace-manager gave no reason.',
      };
  }
}

/**
 * The state in the page's header: the sync's state now, else the last
 * cycle's result. The list's words, with "Unchanged" for a cycle that found
 * nothing to fetch.
 */
export function detailSyncState(workspace: Workspace) {
  const state = syncState(workspace);
  return workspace.lastSync?.result === 'NoChange' &&
    state.label === 'No change'
    ? { ...state, label: 'Unchanged' }
    : state;
}

/**
 * Whether the sync a person asked for at `requestedAt` has ended: nothing
 * runs or waits any more, and the last cycle is no older than the request.
 */
export function requestedSyncEnded(
  workspace: Workspace,
  requestedAt: string,
): boolean {
  if (workspace.activeSync || workspace.syncRequest || !workspace.lastSync) {
    return false;
  }
  return Date.parse(workspace.lastSync.time) >= Date.parse(requestedAt);
}

/** A mirror's key across provider instances. */
export function mirrorKey(mirror: { provider: string; repository: string }) {
  return `${mirror.provider}\u0000${mirror.repository}`;
}

/**
 * The last push of each repository the workspace selects now, as its
 * provider lists it (`preview_workspace`), by {@link mirrorKey}.
 */
export function lastPushes(previews: WorkspacePreview[]): Map<string, string> {
  const pushes = new Map<string, string>();
  for (const preview of previews) {
    for (const repository of preview.repositories) {
      pushes.set(mirrorKey(repository), repository.lastPush);
    }
  }
  return pushes;
}

/**
 * Whether the repository was pushed to after its mirror was synced: its
 * provider's last push is later than the one the last sync recorded.
 */
export function pushedSinceSync(
  mirror: WorkspaceMirror,
  pushes: ReadonlyMap<string, string> | undefined,
): boolean {
  const now = pushes?.get(mirrorKey(mirror));
  return Boolean(now && Date.parse(now) > Date.parse(mirror.pushedAt));
}

/**
 * The mirrors on the page: the selected ones by name, those that left the
 * selection (kept while a Session borrows from them) after them.
 */
export function sortedMirrors(mirrors: WorkspaceMirror[]): WorkspaceMirror[] {
  return [...mirrors].sort(
    (a, b) =>
      Number(Boolean(a.droppedAt)) - Number(Boolean(b.droppedAt)) ||
      a.repository.localeCompare(b.repository),
  );
}

/** Mirrors whose repository, provider or default branch contain the search. */
export function searchMirrors(
  mirrors: WorkspaceMirror[],
  search: string,
): WorkspaceMirror[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return mirrors;
  }
  return mirrors.filter(mirror =>
    [mirror.repository, mirror.provider, mirror.defaultBranch ?? '']
      .join('\n')
      .toLowerCase()
      .includes(needle),
  );
}

/** A commit's short id, as git abbreviates it. */
export function shortHead(head: string | undefined): string | undefined {
  return head ? head.slice(0, 7) : undefined;
}

/**
 * The Session directories on the page: the latest turn first, the
 * directories kagent no longer lists last.
 */
export function sortedDirectories(
  directories: SessionDirectory[],
): SessionDirectory[] {
  const turn = (directory: SessionDirectory) =>
    directory.lastTurn ? Date.parse(directory.lastTurn) : 0;
  return [...directories].sort(
    (a, b) =>
      Number(Boolean(a.unknown)) - Number(Boolean(b.unknown)) ||
      turn(b) - turn(a),
  );
}

/** Directories whose Session name, id or person contain the search. */
export function searchDirectories(
  directories: SessionDirectory[],
  search: string,
): SessionDirectory[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return directories;
  }
  return directories.filter(directory =>
    [directory.name ?? '', directory.session, directory.creator ?? '']
      .join('\n')
      .toLowerCase()
      .includes(needle),
  );
}
