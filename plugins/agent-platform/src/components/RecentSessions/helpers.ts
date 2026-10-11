import {
  describeSessionState,
  isAwaitingInput,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  byLastActive,
  dayBucket,
  lastActiveAt,
  type SessionRow,
} from '../SessionsDataProvider/helpers';

export { lastActiveAt };

/**
 * How many recent sessions a list shows, pinned ones not counted: the shell
 * rail's cutoff, past which All sessions has the rest (T91).
 */
export const DEFAULT_RECENT_SESSIONS_LIMIT = 8;

/**
 * The most pinned sessions the rail lists. Pins are the person's own, so a
 * handful is the norm; past this the rail would push its recent sessions out
 * of view, and the rest are a click away on All sessions' Pinned filter.
 */
export const MAX_RAIL_PINS = 8;

/**
 * The sessions in the lists' one recency order ({@link byLastActive}): most
 * recently active first, sessions with no time at all last. Without `states`
 * that is simply the most recently started.
 */
function sortByLastActive(
  rows: SessionRow[],
  states?: ReadonlyMap<string, SessionStateEntry>,
): SessionRow[] {
  const active = new Map(
    rows.map(row => [row.id, lastActiveAt(row, states?.get(row.id))]),
  );
  return [...rows].sort(byLastActive<SessionRow>(row => active.get(row.id)));
}

/**
 * The `limit` most recently active sessions, most recent first (see
 * {@link lastActiveAt}); sessions with no time at all go last. Without
 * `states` that is simply the most recently started.
 */
export function pickRecentSessions(
  rows: SessionRow[],
  limit: number,
  states?: ReadonlyMap<string, SessionStateEntry>,
): SessionRow[] {
  return sortByLastActive(rows, states).slice(0, Math.max(0, limit));
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

const RAIL_DAY_BUCKETS = [
  { id: 'today', daysBack: 0 },
  { id: 'week', daysBack: 7 },
] as const;

/**
 * The rail bucket of a session last active at `activeAt` (epoch ms), in the
 * reader's local calendar. A time later than `now` (clock skew) counts as
 * today; an unknown one as earlier.
 */
export function railSessionGroup(
  activeAt: number | undefined,
  now: Date,
): RailSessionGroup {
  return dayBucket(activeAt, now, RAIL_DAY_BUCKETS, 'earlier');
}

export type GroupedRailSessions = {
  /**
   * The pinned sessions, in the order they were pinned: the latest
   * {@link MAX_RAIL_PINS} of them, so a new pin always shows.
   */
  pinned: SessionRow[];
  /** Pinned sessions past {@link MAX_RAIL_PINS}, not listed. */
  pinnedOverflow: number;
  /**
   * The unpinned sessions waiting for the person, most recently active first:
   * listed whatever their age, up to the limit (T100 H5).
   */
  waiting: SessionRow[];
  /** The recent, unpinned sessions, most recently active first, bucketed. */
  groups: Array<{ id: RailSessionGroup; label: string; rows: SessionRow[] }>;
  /** Unpinned sessions past the limit: on All sessions, not in the rail. */
  recentOverflow: number;
  /** Every session waiting for the person, pinned or not, listed or not. */
  waitingCount: number;
};

/**
 * The rail's session list (T91, T100). The rule, in full:
 *
 * 1. **Pinned** sessions first, in pin order — the latest
 *    {@link MAX_RAIL_PINS}; older pins are a "N more pinned" link away.
 * 2. Then every other session **waiting for the person**, most recently
 *    active first, however long ago it asked: a question must not age out of
 *    view. They take their room out of the limit; past it, the most recent
 *    `limit` of them are listed.
 * 3. Then the **most recently active** of the rest (see {@link lastActiveAt}:
 *    the later of start and last state change), filling the limit, under
 *    Today / Previous 7 days / Earlier by that same time — so a session
 *    continued today is under Today whenever it was started.
 * 4. Everything past the limit is on **All sessions**, whose link closes the
 *    list and, when the list is cut, says how many more there are; the count
 *    of waiting sessions sits beside it.
 *
 * Pinned sessions do not repeat below and do not count towards the limit.
 * A pin whose session was deleted simply stops matching.
 */
export function groupRailSessions(
  rows: SessionRow[],
  pinnedIds: string[],
  limit: number,
  now: Date,
  states: ReadonlyMap<string, SessionStateEntry> = new Map(),
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

  const isWaiting = (row: SessionRow) => needsAttention(states.get(row.id));
  const cap = Math.max(0, limit);
  const unpinned = sortByLastActive(
    rows.filter(row => !pinnedSet.has(row.id)),
    states,
  );
  const waiting = unpinned.filter(isWaiting).slice(0, cap);
  const recent = unpinned
    .filter(row => !isWaiting(row))
    .slice(0, cap - waiting.length);
  const byGroup = new Map<RailSessionGroup, SessionRow[]>();
  for (const row of recent) {
    const group = railSessionGroup(lastActiveAt(row, states.get(row.id)), now);
    byGroup.set(group, [...(byGroup.get(group) ?? []), row]);
  }
  const groups = RAIL_SESSION_GROUPS.flatMap(({ id, label }) => {
    const groupRows = byGroup.get(id);
    return groupRows ? [{ id, label, rows: groupRows }] : [];
  });

  return {
    pinned,
    pinnedOverflow,
    waiting,
    groups,
    recentOverflow: unpinned.length - waiting.length - recent.length,
    waitingCount: rows.filter(isWaiting).length,
  };
}
