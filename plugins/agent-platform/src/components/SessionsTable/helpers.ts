import {
  AWAITING_INPUT_STATES,
  describeSessionState,
  FAILED_STATES,
  SessionState,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import {
  byLastActive,
  lastActiveAt,
  SessionRow,
} from '../SessionsDataProvider/helpers';

/**
 * What the State column has to say about one row.
 *
 * Four outcomes rather than a state or nothing, because the three ways a state
 * can be missing are not the same fact and a person acts differently on each:
 *
 * - `state` — the newest turn reported one.
 * - `idle` — the session was evaluated and no turn reported a state at all:
 *   created and never run. A real condition, not a gap in what we know.
 * - `unreadable` — the read failed, so the state is genuinely unknown. Never
 *   drawn as terminal: "we could not tell" and "it is finished" are opposite
 *   answers to "is anything waiting on me".
 * - `unevaluated` — the summary never looked: past the activity window or the
 *   per-pass cap, or the states have not arrived yet.
 */
export type SessionStateCell =
  | { kind: 'state'; state: SessionState; changedAt?: number }
  | { kind: 'idle' }
  | { kind: 'unreadable' }
  | { kind: 'unevaluated' };

/** A session row with the state column's answer joined onto it. */
export type SessionTableRow = SessionRow & {
  stateCell: SessionStateCell;
  /** Sort key for the State column — see {@link stateRank}. */
  stateRank: number;
  /**
   * Whether the user pinned this session (`usePinnedSessions`). Joined onto the
   * row by the shell table so the Pinned chip and group can run through the
   * same filter and grouping code as the states; the classic table never sets
   * it.
   */
  pinned?: boolean;
  /**
   * When the session was last active, epoch ms (`lastActiveAt`): what the
   * shell list orders and groups by, as the rail does (T100 M1).
   */
  lastActiveAt?: number;
};

/**
 * Order the State column sorts in, ascending: what needs a person first.
 *
 * Alphabetical labels would put "Failed" above "Waiting for you", which
 * inverts the only reason to sort by state at all. Descending still reverses
 * this, so both directions are useful — most urgent first, or everything
 * settled first.
 */
export const STATE_RANKS = {
  waiting: 0,
  running: 1,
  failed: 2,
  finished: 3,
  idle: 4,
  unreadable: 5,
  unevaluated: 6,
} as const;

/** The State cell's words for a session that could not be read. */
export const STATE_UNKNOWN_LABEL = 'Unknown';
/** The State cell's words for a session no turn reported a state for. */
export const STATE_IDLE_LABEL = 'No activity yet';

/** The rank a cell sorts at. */
export function stateRank(cell: SessionStateCell): number {
  switch (cell.kind) {
    case 'idle':
      return STATE_RANKS.idle;
    case 'unreadable':
      return STATE_RANKS.unreadable;
    case 'unevaluated':
      return STATE_RANKS.unevaluated;
    default:
      break;
  }
  const { state } = cell;
  if (AWAITING_INPUT_STATES.has(state.key)) {
    return STATE_RANKS.waiting;
  }
  if (state.isActive) {
    return STATE_RANKS.running;
  }
  return FAILED_STATES.has(state.key)
    ? STATE_RANKS.failed
    : STATE_RANKS.finished;
}

/** The session lists' one recency order, over the joined rows. */
export const compareSessionRecency = byLastActive<SessionTableRow>(
  row => row.lastActiveAt,
);

/**
 * Sort by the State column: by {@link stateRank}, then most recently active
 * first ({@link compareSessionRecency}, unknown last in either direction), so
 * two waiting sessions do not read in whatever order the fleet answered in.
 */
export function sortSessionsByState(
  rows: SessionTableRow[],
  direction: 'ascending' | 'descending',
): SessionTableRow[] {
  const factor = direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) =>
    a.stateRank !== b.stateRank
      ? (a.stateRank - b.stateRank) * factor
      : compareSessionRecency(a, b),
  );
}

/**
 * Join the states summary onto the rows the table renders.
 *
 * The lookup is by the row's `id` (`${installation}/${sessionId}`), because the
 * fleet list can hold the same kagent session id twice — once per installation.
 *
 * While the summary is still loading every row reads `unevaluated`, which the
 * column draws as a placeholder rather than as a claim.
 */
export function withSessionStates(
  rows: SessionRow[],
  states: FleetSessionStatesView | undefined,
): SessionTableRow[] {
  return rows.map(row => {
    const cell = readStateCell(row, states);
    return {
      ...row,
      stateCell: cell,
      stateRank: stateRank(cell),
      lastActiveAt: lastActiveAt(row, states?.states.get(row.id)),
    };
  });
}

function readStateCell(
  row: SessionRow,
  states: FleetSessionStatesView | undefined,
): SessionStateCell {
  if (!states) {
    return { kind: 'unevaluated' };
  }
  const entry = states.states.get(row.id);
  if (entry) {
    const state = describeSessionState(entry.state ?? undefined);
    return state
      ? {
          kind: 'state',
          state,
          ...(entry.changedAt === undefined
            ? {}
            : { changedAt: entry.changedAt }),
        }
      : // An entry whose `state` is null: evaluated, and no turn reported one.
        { kind: 'idle' };
  }
  // The unreadable list is only consulted for a row the states do not cover, so
  // a session read successfully on a later pass is never marked unknown because
  // an earlier one failed. An installation whose whole summary failed makes
  // every one of its rows unknown, which is a different fact from a row the
  // summary chose not to evaluate.
  return states.unreadable.has(row.id) ||
    states.failedInstallations.has(row.installation)
    ? { kind: 'unreadable' }
    : { kind: 'unevaluated' };
}

/**
 * The day a shell list row is grouped under, by when its session was last
 * active — the time it is ordered by.
 */
export type SessionDayGroup = 'today' | 'yesterday' | 'earlier';

export const SESSION_DAY_GROUPS: ReadonlyArray<{
  id: SessionDayGroup;
  label: string;
}> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'earlier', label: 'Earlier' },
];

/**
 * The groups a shell list row can sit under: the day it was last active, or
 * the Pinned group that leads the list whatever day its rows were.
 */
export type SessionListGroup = SessionDayGroup | 'pinned';

export const PINNED_GROUP_LABEL = 'Pinned';

/**
 * The day group of a session last active at `activeAt` (epoch ms), in the
 * reader's local calendar. A time later than `now` (clock skew) counts as
 * today; an unknown one as earlier.
 */
export function sessionDayGroup(
  activeAt: number | undefined,
  now: Date,
): SessionDayGroup {
  if (activeAt === undefined || Number.isNaN(activeAt)) {
    return 'earlier';
  }
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  ).getTime();
  if (activeAt >= startOfToday) {
    return 'today';
  }
  return activeAt >= startOfYesterday ? 'yesterday' : 'earlier';
}

/**
 * A session's time (when it was last active), as short as its group allows:
 * the time of day under Today and Yesterday, the date under Earlier and Pinned
 * (whose rows can be from any day), with the year only when it is not the
 * current one.
 */
export function formatSessionTime(
  at: number,
  group: SessionListGroup,
  currentYear: number,
): string {
  const date = new Date(at);
  if (group === 'today' || group === 'yesterday') {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === currentYear ? {} : { year: 'numeric' }),
  });
}
