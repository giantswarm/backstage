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
 * is {@link workspaceRowId}.
 */
export type WorkspaceRow = Workspace & { installation: string; id: string };

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
 * The Last sync column: the state now (deleting, syncing, requested), else
 * the last cycle's result. When it happened sits behind the state's info hint:
 * `Synced 5 minutes ago.`
 */
export function syncState(workspace: Workspace): {
  label: string;
  tone: SyncTone;
  /** What happened when, for a state that refers to a time. */
  when?: { verb: string; at: string };
  /** The manager's own words, for a failure. */
  detail?: string;
} {
  if (workspace.deleting) {
    return { label: 'Deleting', tone: 'neutral' };
  }
  if (workspace.activeSync) {
    return {
      label: 'Synchronizing',
      tone: 'info',
      when: { verb: 'Started', at: workspace.activeSync.startedAt },
    };
  }
  if (workspace.syncRequest) {
    return {
      label: 'Synchronization requested',
      tone: 'info',
      when: { verb: 'Requested', at: workspace.syncRequest.requestedAt },
    };
  }
  const last = workspace.lastSync;
  if (!last) {
    return { label: 'Not synchronized yet', tone: 'neutral' };
  }
  const { label, tone } = lastSyncLabel(last);
  switch (last.result) {
    case 'Succeeded':
      return { label, tone, when: { verb: 'Synchronized', at: last.time } };
    case 'NoChange':
      return { label, tone, when: { verb: 'Checked', at: last.time } };
    default:
      return {
        label,
        tone,
        when: { verb: 'Failed', at: last.time },
        detail: last.message,
      };
  }
}

/** Whether the row changes on its own soon: worth reading again. */
export function isSettling(workspace: Workspace): boolean {
  return Boolean(
    workspace.deleting || workspace.activeSync || workspace.syncRequest,
  );
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
