/**
 * What the Workspaces tab shows of a workspace: its row's words, from
 * `list_workspaces`.
 */

import { matches } from './search';
import { formatBytes } from './formatNumbers';
import { quantityToGiB } from './workspaceDraft';
import type { LastSync, Workspace, WorkspaceSource } from './workspaceManager';
import { keptPicks, localSourceCount } from './workspaceSelection';

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

/**
 * One source in short, for the Workspaces tab: the owner and how many
 * repositories it selects, `example-org · 7 repositories`, counted as the
 * manager selects (an exclusion drops a pick by name; one that names no pick
 * drops nothing). A source with filters is the manager's to count, so it
 * names its filters instead, and the picks by name an exclusion leaves:
 * `example-org · lang Go · topic mcp · 2 by name`. The lists in full are on
 * the workspace's page.
 */
export function sourceSummary(source: WorkspaceSource): string {
  const local = localSourceCount(source);
  if (local && (source.repositories?.length ?? 0) > 0) {
    const noun = local.total === 1 ? 'repository' : 'repositories';
    return `${source.owner} · ${local.total} ${noun}`;
  }
  const parts: string[] = [];
  const languages = source.filters?.languages ?? [];
  if (languages.length > 0) {
    parts.push(`lang ${languages.join(', ')}`);
  }
  const topics = source.filters?.topics;
  if (topics && topics.names.length > 0) {
    const joiner = topics.match === 'all' ? ' + ' : ', ';
    parts.push(`topic ${topics.names.join(joiner)}`);
  }
  const picks = keptPicks(source).length;
  if (picks > 0) {
    parts.push(`${picks} by name`);
  }
  if (parts.length === 0) {
    parts.push('all repositories');
  }
  return [source.owner, ...parts].join(' · ');
}

/** Every source of a workspace in short, one after the other. */
export function sourcesSummary(sources: WorkspaceSource[]): string {
  return sources.map(sourceSummary).join('; ');
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
  /** What started it: a create, a saved change, or Synchronize. */
  cause: 'created' | 'changed' | 'requested';
  /** The last sync's time when it was started; `''` before the first. */
  after: string;
  /**
   * The sync Job that ran when it was started: it ends first, and the
   * change's own cycle starts after it.
   */
  behind?: string;
  /** When it was started, in this browser's milliseconds. */
  since: number;
};

/**
 * How long a sync the manager does not report yet is expected: past it the
 * list and the page stop saying Synchronizing for it and stop reading again.
 * A sync the manager reports is followed until it ends.
 */
export const SYNC_FOLLOW_MS = 30 * 60_000;

/** How often a sync is read again in its first minutes, and after them. */
export const SYNC_REFETCH_MS = 5_000;
export const SYNC_REFETCH_SLOW_MS = 15_000;
const SYNC_FAST_FOR_MS = 2 * 60_000;

/**
 * Whether the awaited sync has ended: nothing runs or waits, and the last
 * sync is another one than `after` and than the Job it waited `behind`. The
 * manager names a requested cycle (`syncRequest`, then `activeSync`) until it
 * records its result, so no read falls between.
 */
export function syncEnded(
  workspace: Workspace,
  { after, behind }: Pick<AwaitedSync, 'after' | 'behind'>,
): boolean {
  const last = workspace.lastSync;
  return (
    !workspace.activeSync &&
    !workspace.syncRequest &&
    (last?.time ?? '') !== after &&
    !(behind && last?.job === behind)
  );
}

/** Whether an awaited sync is still expected: not ended, not given up on. */
export function isAwaiting(
  workspace: Workspace,
  awaited: AwaitedSync,
  now: number = Date.now(),
): boolean {
  return (
    !workspace.deleting &&
    now - awaited.since < SYNC_FOLLOW_MS &&
    !syncEnded(workspace, awaited)
  );
}

const AWAITED_VERB: Record<AwaitedSync['cause'], string> = {
  created: 'Created',
  changed: 'Changed',
  requested: 'Requested',
};

/**
 * The sync under way, `undefined` while none is: one the manager reports
 * running or waiting (`activeSync`, `syncRequest`), followed until it ends;
 * else one only expected — the person started it and the read does not show
 * it ended, or the workspace has never synchronized (the manager syncs a new
 * workspace right away) — for {@link SYNC_FOLLOW_MS}. `reported` when the
 * manager reports it or accepted the request: Synchronize waits for it.
 */
function syncUnderWay(
  workspace: Workspace,
  awaited: AwaitedSync | undefined,
  now: number,
):
  | { start: number; reported: boolean; when: { verb: string; at: string } }
  | undefined {
  if (workspace.deleting) {
    return undefined;
  }
  if (workspace.activeSync) {
    const at = workspace.activeSync.startedAt;
    return {
      start: Date.parse(at),
      reported: true,
      when: { verb: 'Started', at },
    };
  }
  if (workspace.syncRequest) {
    const at = workspace.syncRequest.requestedAt;
    return {
      start: Date.parse(at),
      reported: true,
      when: { verb: 'Requested', at },
    };
  }
  if (awaited && isAwaiting(workspace, awaited, now)) {
    return {
      start: awaited.since,
      reported: awaited.cause === 'requested',
      when: {
        verb: AWAITED_VERB[awaited.cause],
        at:
          awaited.cause === 'created'
            ? workspace.createdAt
            : new Date(awaited.since).toISOString(),
      },
    };
  }
  const created = Date.parse(workspace.createdAt);
  if (!workspace.lastSync && now - created < SYNC_FOLLOW_MS) {
    return {
      start: created,
      reported: false,
      when: { verb: 'Created', at: workspace.createdAt },
    };
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
  /** A sync runs, waits, or is expected: the state says Synchronizing. */
  syncing: boolean;
  /**
   * The manager reports the sync, or accepted its request: Synchronize says
   * Synchronizing… and waits. A sync only expected leaves Synchronize to the
   * person.
   */
  reported: boolean;
  /** What happened when, for a state that refers to a time. */
  when?: { verb: string; at: string };
  /** The manager's own words, for a failure. */
  detail?: string;
} {
  if (workspace.deleting) {
    return {
      label: 'Deleting',
      tone: 'neutral',
      syncing: false,
      reported: false,
    };
  }
  const underWay = syncUnderWay(workspace, awaited, now);
  if (underWay) {
    return {
      label: 'Synchronizing',
      tone: 'info',
      syncing: true,
      reported: underWay.reported,
      when: underWay.when,
    };
  }
  const settled = { syncing: false, reported: false };
  const last = workspace.lastSync;
  if (!last) {
    return { label: 'Not synchronized yet', tone: 'neutral', ...settled };
  }
  const { label, tone } = lastSyncLabel(last);
  switch (last.result) {
    case 'Succeeded':
      return {
        label,
        tone,
        ...settled,
        when: { verb: 'Synchronized', at: last.time },
      };
    case 'NoChange':
      return {
        label,
        tone,
        ...settled,
        when: { verb: 'Checked', at: last.time },
      };
    default:
      return {
        label,
        tone,
        ...settled,
        when: { verb: 'Failed', at: last.time },
        detail: last.message,
      };
  }
}

/**
 * How soon to read a workspace again while its sync is under way: often in
 * its first minutes, less often after them, not at all while none is (a
 * deletion included). A start the browser's clock puts in the future counts
 * from now.
 */
export function syncRefetchInterval(
  workspace: Workspace,
  awaited: AwaitedSync | undefined,
  now: number = Date.now(),
): number | false {
  const underWay = syncUnderWay(workspace, awaited, now);
  if (!underWay) {
    return false;
  }
  const running = Number.isNaN(underWay.start) ? 0 : now - underWay.start;
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
