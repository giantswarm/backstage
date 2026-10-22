/**
 * What the Workspaces tab shows of a workspace: its row's words, from
 * `list_workspaces`.
 */

import { matches } from './search';
import { formatBytes } from './formatNumbers';
import { quantityToGiB } from './workspaceDraft';
import type { LastSync, Workspace, WorkspaceSource } from './workspaceManager';

/**
 * A workspace with the installation whose workspace-manager listed it; `id`
 * is {@link workspaceRowId}. `awaitedSync` is a sync the person started here
 * that the list may not show yet.
 */
export type WorkspaceRow = Workspace & {
  installation: string;
  id: string;
  awaitedSync?: AwaitedSync;
};

/** A row's identity across installations. */
export function workspaceRowId(row: {
  installation: string;
  name: string;
}): string {
  return `${row.installation}/${row.name}`;
}

/**
 * One source in a line: `example-org · lang Go · topic mcp`, the
 * repositories by name (`repo-a, repo-b`), the exclusions last. A source
 * with neither names nor filters selects all of the owner's repositories.
 */
export function sourceLabel(source: WorkspaceSource): string {
  const parts: string[] = [];
  if (source.repositories?.length) {
    parts.push(source.repositories.join(', '));
  }
  const languages = source.filters?.languages ?? [];
  if (languages.length > 0) {
    parts.push(`lang ${languages.join(', ')}`);
  }
  const topics = source.filters?.topics;
  if (topics && topics.names.length > 0) {
    const joiner = topics.match === 'all' ? ' + ' : ', ';
    parts.push(`topic ${topics.names.join(joiner)}`);
  }
  if (parts.length === 0) {
    parts.push('all repositories');
  }
  if (source.exclude?.length) {
    parts.push(`excl. ${source.exclude.join(', ')}`);
  }
  return [source.owner, ...parts].join(' · ');
}

/** Every source of a workspace, one after the other. */
export function sourcesLabel(sources: WorkspaceSource[]): string {
  return sources.map(sourceLabel).join('; ');
}

/** What a muster without per-user sign-in withholds, and what goes through the manager. */
export const WORKSPACES_BLOCKED = 'Workspaces cannot be used';
export const WORKSPACES_VIA =
  'Workspaces are managed through workspace-manager';

export type SyncTone = 'success' | 'danger' | 'info' | 'neutral';

/** A sync cycle's result in one word, the list's and the page's alike. */
export function lastSyncLabel(last: LastSync): {
  label: string;
  tone: SyncTone;
} {
  switch (last.result) {
    case 'Succeeded':
      return { label: 'Synchronized', tone: 'success' };
    case 'NoChange':
      return { label: 'Unchanged', tone: 'success' };
    default:
      return { label: 'Failed', tone: 'danger' };
  }
}

/**
 * A sync the person started here, by creating or changing the workspace or
 * with Synchronize, that a read may not show yet: the manager starts a
 * change's cycle a moment after the write, and until then nothing in the
 * workspace says one is due.
 */
export type AwaitedSync = {
  /** The last sync's time when it was started; `''` before the first. */
  after: string;
  /** When it was started, in this browser's milliseconds. */
  since: number;
};

/**
 * How long a sync is followed from its start. Past it the list and the page
 * stop reading again and show what they read last; coming back to the tab
 * reads once more.
 */
export const SYNC_FOLLOW_MS = 30 * 60_000;

/** How often a sync is read again in its first minutes, and after them. */
export const SYNC_REFETCH_MS = 5_000;
export const SYNC_REFETCH_SLOW_MS = 15_000;
const SYNC_FAST_FOR_MS = 2 * 60_000;

/**
 * Whether a sync started when the last sync was `after` has ended: nothing
 * runs or waits, and the last sync is another one. The manager names a
 * requested cycle (`syncRequest`, then `activeSync`) until it records its
 * result, so no read falls between.
 */
export function syncEnded(workspace: Workspace, after: string): boolean {
  return (
    !workspace.activeSync &&
    !workspace.syncRequest &&
    (workspace.lastSync?.time ?? '') !== after
  );
}

/**
 * When the sync under way started, in milliseconds; `undefined` while none
 * is. Under way: one runs or waits (`activeSync`, `syncRequest`), the person
 * started one the read does not show ended, or the workspace has never
 * synchronized — the manager syncs a new workspace right away. The last two
 * only for {@link SYNC_FOLLOW_MS}, so a manager that never starts one is not
 * waited for forever.
 */
function syncStartedAt(
  workspace: Workspace,
  awaited: AwaitedSync | undefined,
  now: number,
): number | undefined {
  if (workspace.deleting) {
    return undefined;
  }
  if (workspace.activeSync) {
    return Date.parse(workspace.activeSync.startedAt);
  }
  if (workspace.syncRequest) {
    return Date.parse(workspace.syncRequest.requestedAt);
  }
  if (
    awaited &&
    now - awaited.since < SYNC_FOLLOW_MS &&
    !syncEnded(workspace, awaited.after)
  ) {
    return awaited.since;
  }
  const created = Date.parse(workspace.createdAt);
  if (!workspace.lastSync && now - created < SYNC_FOLLOW_MS) {
    return created;
  }
  return undefined;
}

/**
 * The workspace's sync state in a word, the list's, the page's and its
 * Synchronize button's alike: the state now (deleting, synchronizing), else
 * the last cycle's result. When it happened sits behind the state's info hint:
 * `Synchronized 5 minutes ago.` `awaited` is a sync the person started here
 * (see {@link AwaitedSync}).
 */
export function syncState(
  workspace: Workspace,
  awaited?: AwaitedSync,
  now: number = Date.now(),
): {
  label: string;
  tone: SyncTone;
  /** A sync runs, waits, or is due: the button says so and is disabled. */
  syncing: boolean;
  /** What happened when, for a state that refers to a time. */
  when?: { verb: string; at: string };
  /** The manager's own words, for a failure. */
  detail?: string;
} {
  if (workspace.deleting) {
    return { label: 'Deleting', tone: 'neutral', syncing: false };
  }
  const synchronizing = {
    label: 'Synchronizing',
    tone: 'info' as const,
    syncing: true,
  };
  if (workspace.activeSync) {
    return {
      ...synchronizing,
      when: { verb: 'Started', at: workspace.activeSync.startedAt },
    };
  }
  if (workspace.syncRequest) {
    return {
      ...synchronizing,
      when: { verb: 'Requested', at: workspace.syncRequest.requestedAt },
    };
  }
  const started = syncStartedAt(workspace, awaited, now);
  if (started !== undefined) {
    return {
      ...synchronizing,
      when: {
        verb: awaited?.since === started ? 'Requested' : 'Created',
        at: new Date(started).toISOString(),
      },
    };
  }
  const last = workspace.lastSync;
  if (!last) {
    return { label: 'Not synchronized yet', tone: 'neutral', syncing: false };
  }
  const { label, tone } = lastSyncLabel(last);
  switch (last.result) {
    case 'Succeeded':
      return {
        label,
        tone,
        syncing: false,
        when: { verb: 'Synchronized', at: last.time },
      };
    case 'NoChange':
      return {
        label,
        tone,
        syncing: false,
        when: { verb: 'Checked', at: last.time },
      };
    default:
      return {
        label,
        tone,
        syncing: false,
        when: { verb: 'Failed', at: last.time },
        detail: last.message,
      };
  }
}

/**
 * How soon to read a workspace again while its sync is under way: often in
 * its first minutes, less often after them, not at all past
 * {@link SYNC_FOLLOW_MS} or while none is (a deletion included).
 */
export function syncRefetchInterval(
  workspace: Workspace,
  awaited: AwaitedSync | undefined,
  now: number = Date.now(),
): number | false {
  const started = syncStartedAt(workspace, awaited, now);
  if (started === undefined) {
    return false;
  }
  // A start the read cannot date counts from now.
  const running = Number.isNaN(started) ? 0 : now - started;
  if (running >= SYNC_FOLLOW_MS) {
    return false;
  }
  return running < SYNC_FAST_FOR_MS ? SYNC_REFETCH_MS : SYNC_REFETCH_SLOW_MS;
}

/**
 * How soon to read an installation's list again: the soonest of its
 * workspaces', and slowly while one is being deleted, until it is gone.
 */
export function workspacesRefetchInterval(
  workspaces: Workspace[],
  awaitedOf: (workspace: Workspace) => AwaitedSync | undefined,
  now: number = Date.now(),
): number | false {
  const intervals = workspaces.flatMap(workspace => {
    const interval = workspace.deleting
      ? SYNC_REFETCH_SLOW_MS
      : syncRefetchInterval(workspace, awaitedOf(workspace), now);
    return interval === false ? [] : [interval];
  });
  return intervals.length > 0 ? Math.min(...intervals) : false;
}

/** A volume's Kubernetes quantity in GiB (`15Gi` → `15 GiB`), else as written. */
export function sizeLabel(quantity: string): string {
  const gib = quantityToGiB(quantity);
  return gib ? `${gib} GiB` : quantity;
}

/**
 * What the volume stores (mirrors and session directories), the share's size
 * where its class provisions one, and ↑ when the last sync grew the share:
 * `9.5 GiB of 15 GiB ↑`.
 */
export function storedLabel(
  storedBytes: number,
  volumeSize?: string,
  grewFrom?: string,
): string {
  const stored = formatBytes(storedBytes);
  const share = volumeSize ? `${stored} of ${sizeLabel(volumeSize)}` : stored;
  return grewFrom ? `${share} ↑` : share;
}

/** Rows whose name, Organization or sources contain the search. */
export function searchWorkspaces(
  rows: WorkspaceRow[],
  search: string,
): WorkspaceRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter(row =>
    matches(needle, [
      row.name,
      row.organization,
      row.installation,
      sourcesLabel(row.sources),
    ]),
  );
}

/** "1 session", "3 sessions". */
export function sessionsNoun(count: number): string {
  return `${count} ${count === 1 ? 'session' : 'sessions'}`;
}
