/**
 * What a workspace's page says of it: its last sync, what started it, its
 * repositories and the Sessions with a directory on its volume, from
 * `get_workspace`.
 */

import { matches } from './search';
import { lastSyncLabel, type SyncTone } from './workspaceList';
import type {
  LastSync,
  SessionDirectory,
  SyncTrigger,
  WorkspaceMirror,
  WorkspacePreview,
} from './workspaceManager';

/**
 * What started a sync cycle, as the page says it. A Session's start past the
 * refresh threshold and Synchronize both reach the manager as a request; the
 * manager records no schedule any more, but a cycle that ran at the upgrade
 * may still name it.
 */
export function syncTriggerLabel(
  trigger: SyncTrigger | undefined,
): string | undefined {
  switch (trigger) {
    case 'change':
      return 'A change to the workspace';
    case 'request':
      return 'A request: Synchronize, or a session starting on it';
    case 'retry':
      return 'A retry after the failed synchronization before it';
    case 'cleanup':
      return 'A session directory due for cleanup';
    case 'sessionDeleted':
      return 'A deleted session’s directory';
    case 'deletion':
      return 'The workspace’s deletion';
    case 'schedule':
      return 'The old nightly schedule';
    default:
      return undefined;
  }
}

/**
 * The last sync's result in a word and a sentence: what it fetched, that it
 * fetched nothing, or why it failed in the manager's own words.
 */
export function lastSyncResult(last: LastSync): {
  label: string;
  tone: SyncTone;
  sentence: string;
} {
  const { label, tone } = lastSyncLabel(last);
  switch (last.result) {
    case 'Succeeded':
      return {
        label,
        tone,
        sentence: 'Fetched what changed since the synchronization before.',
      };
    case 'NoChange':
      return {
        label,
        tone,
        sentence: 'Nothing had changed, so nothing was fetched.',
      };
    default:
      return {
        label,
        tone,
        sentence: last.message
          ? `The mirrors stay as they were: ${last.message}`
          : 'The mirrors stay as they were; no reason was given.',
      };
  }
}

/** A mirror's key across provider instances. */
export function mirrorKey(mirror: { provider: string; repository: string }) {
  return `${mirror.provider}\u0000${mirror.repository}`;
}

/**
 * The last push of each repository the workspace selects now, as its
 * providers list it (`preview_workspace`), by {@link mirrorKey}; `partial`
 * when the pages read left some of them out.
 */
export type LastPushes = {
  pushes: ReadonlyMap<string, string>;
  partial: boolean;
};

export function lastPushes(
  previews: WorkspacePreview[],
  partial: boolean,
): LastPushes {
  const pushes = new Map<string, string>();
  for (const preview of previews) {
    for (const repository of preview.repositories) {
      pushes.set(mirrorKey(repository), repository.lastPush);
    }
  }
  return { pushes, partial };
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
  return needle
    ? mirrors.filter(mirror =>
        matches(needle, [
          mirror.repository,
          mirror.provider,
          mirror.defaultBranch,
        ]),
      )
    : mirrors;
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
  return needle
    ? directories.filter(directory =>
        matches(needle, [directory.name, directory.session, directory.creator]),
      )
    : directories;
}
