import {
  describeSessionState,
  isAwaitingInput,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  sortSessionRows,
  type SessionRow,
} from '../SessionsDataProvider/helpers';

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
 * When a session was last active, epoch ms: the later of its start and the
 * moment its state last moved — a message sent, a reply finished, a question
 * asked. kagent does not move a session's `updatedAt` on a turn
 * (kagent-dev/kagent#2397), so the derived state's `changedAt` is the only
 * record of activity after the start. Undefined when neither is known.
 */
export function lastActiveAt(
  row: SessionRow,
  state?: SessionStateEntry,
): number | undefined {
  const started = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  const times = [started, state?.changedAt ?? Number.NaN].filter(
    time => !Number.isNaN(time),
  );
  return times.length > 0 ? Math.max(...times) : undefined;
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
  if (!states) {
    return sortSessionRows(rows).slice(0, Math.max(0, limit));
  }
  const active = new Map(
    rows.map(row => [row.id, lastActiveAt(row, states.get(row.id))]),
  );
  return [...rows]
    .sort((a, b) => {
      const aTime = active.get(a.id);
      const bTime = active.get(b.id);
      if (aTime !== bTime) {
        if (aTime === undefined) return 1;
        if (bTime === undefined) return -1;
        return bTime - aTime;
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, Math.max(0, limit));
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
 * The rail bucket of a session last active at `activeAt` (epoch ms), in the
 * reader's local calendar. A time later than `now` (clock skew) counts as
 * today; an unknown one as earlier.
 */
export function railSessionGroup(
  activeAt: number | undefined,
  now: Date,
): RailSessionGroup {
  if (activeAt === undefined || Number.isNaN(activeAt)) {
    return 'earlier';
  }
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (activeAt >= startOfToday) {
    return 'today';
  }
  const startOfWindow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 7,
  ).getTime();
  return activeAt >= startOfWindow ? 'week' : 'earlier';
}

export type GroupedRailSessions = {
  /**
   * The pinned sessions, in the order they were pinned: the latest
   * {@link MAX_RAIL_PINS} of them, so a new pin always shows.
   */
  pinned: SessionRow[];
  /** Pinned sessions past {@link MAX_RAIL_PINS}, not listed. */
  pinnedOverflow: number;
  /** The recent, unpinned sessions, most recently active first, bucketed. */
  groups: Array<{ id: RailSessionGroup; label: string; rows: SessionRow[] }>;
  /** Unpinned sessions past the limit: on All sessions, not in the rail. */
  recentOverflow: number;
};

/**
 * The rail's session list (T91). The rule, in full:
 *
 * 1. **Pinned** sessions first, in pin order — the latest
 *    {@link MAX_RAIL_PINS}; older pins are a "N more pinned" link away.
 * 2. Then the **`limit` most recently active** of the other sessions (see
 *    {@link lastActiveAt}: the later of start and last state change), under
 *    Today / Previous 7 days / Earlier by that same time — so a session
 *    continued today is under Today whenever it was started.
 * 3. Everything past the limit is on **All sessions**, whose link closes the
 *    list and, when the list is cut, says how many more there are.
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

  const unpinned = rows.filter(row => !pinnedSet.has(row.id));
  const recent = pickRecentSessions(unpinned, limit, states);
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
    groups,
    recentOverflow: unpinned.length - recent.length,
  };
}
