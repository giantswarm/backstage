import {
  describeSessionState,
  isAwaitingInput,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  sortSessionRows,
  type SessionRow,
} from '../SessionsDataProvider/helpers';

export const DEFAULT_RECENT_SESSIONS_LIMIT = 8;

/**
 * The most pinned sessions the rail lists. Pins are the person's own, so a
 * handful is the norm; past this the rail would push its recent sessions out
 * of view, and the rest are a click away on All sessions' Pinned chip.
 */
export const MAX_RAIL_PINS = 8;

/** The `limit` most recently started sessions, newest first. */
export function pickRecentSessions(
  rows: SessionRow[],
  limit: number,
): SessionRow[] {
  return sortSessionRows(rows).slice(0, Math.max(0, limit));
}

/** Whether the session's agent is on a reply, not waiting on a person. */
export function isWorking(entry: SessionStateEntry | undefined): boolean {
  const state = describeSessionState(entry?.state ?? undefined);
  return state !== undefined && state.isActive && !isAwaitingInput(state);
}

/** Whether the session is waiting on a person. */
export function needsAttention(entry: SessionStateEntry | undefined): boolean {
  return isAwaitingInput(describeSessionState(entry?.state ?? undefined));
}

/** The rail's time buckets, as the prototype names them. */
export type RailSessionGroup = 'today' | 'week' | 'earlier';

export const RAIL_SESSION_GROUPS: ReadonlyArray<{
  id: RailSessionGroup;
  label: string;
}> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Previous 7 days' },
  { id: 'earlier', label: 'Earlier' },
];

/**
 * The rail bucket of a session started at `createdAt`, in the reader's local
 * calendar. A start later than `now` (clock skew) counts as today; a missing
 * or unparseable one as earlier.
 */
export function railSessionGroup(
  createdAt: string | undefined,
  now: Date,
): RailSessionGroup {
  const started = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (Number.isNaN(started)) {
    return 'earlier';
  }
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (started >= startOfToday) {
    return 'today';
  }
  const startOfWindow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 7,
  ).getTime();
  return started >= startOfWindow ? 'week' : 'earlier';
}

export type GroupedRailSessions = {
  /**
   * The pinned sessions, in the order they were pinned: the latest
   * {@link MAX_RAIL_PINS} of them, so a new pin always shows.
   */
  pinned: SessionRow[];
  /** Pinned sessions past {@link MAX_RAIL_PINS}, not listed. */
  pinnedOverflow: number;
  /** The recent, unpinned sessions, newest first, in the rail's buckets. */
  groups: Array<{ id: RailSessionGroup; label: string; rows: SessionRow[] }>;
};

/**
 * The rail's session history: the pinned sessions resolved against the live
 * list (a pin whose session was deleted simply stops matching), and the
 * `limit` most recently started of the others under the prototype's time
 * headings. Pinned sessions do not repeat in the time groups and do not eat
 * into the limit; past `maxPins` only the latest pins are listed.
 */
export function groupRailSessions(
  rows: SessionRow[],
  pinnedIds: string[],
  limit: number,
  now: Date,
  maxPins: number = MAX_RAIL_PINS,
): GroupedRailSessions {
  const byId = new Map(rows.map(row => [row.id, row]));
  const pinnedSet = new Set(pinnedIds);
  const allPinned = pinnedIds.flatMap(id => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const pinnedOverflow = Math.max(0, allPinned.length - maxPins);
  const pinned = allPinned.slice(pinnedOverflow);

  const recent = pickRecentSessions(
    rows.filter(row => !pinnedSet.has(row.id)),
    limit,
  );
  const byGroup = new Map<RailSessionGroup, SessionRow[]>();
  for (const row of recent) {
    const group = railSessionGroup(row.createdAt, now);
    byGroup.set(group, [...(byGroup.get(group) ?? []), row]);
  }
  const groups = RAIL_SESSION_GROUPS.flatMap(({ id, label }) => {
    const groupRows = byGroup.get(id);
    return groupRows ? [{ id, label, rows: groupRows }] : [];
  });

  return { pinned, pinnedOverflow, groups };
}
