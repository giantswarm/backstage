import {
  describeSessionState,
  SessionState,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  formatLocalDay,
  formatLocalTime,
  TABLE_NAME_COLUMN_MIN_WIDTH,
} from '@giantswarm/backstage-plugin-ui-react';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import {
  byLastActive,
  dayBucket,
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
  /**
   * Whether the user pinned this session (`usePinnedSessions`). Joined onto the
   * row by the table so the Pinned filter and group run through the same
   * filter and grouping code as the states.
   */
  pinned?: boolean;
  /**
   * When the session was last active, epoch ms (`lastActiveAt`): what the
   * shell list orders and groups by, as the rail does (T100 M1).
   */
  lastActiveAt?: number;
};

/** The State cell's words for a session that could not be read. */
export const STATE_UNKNOWN_LABEL = 'Unknown';
/** The State cell's words for a session no turn reported a state for. */
export const STATE_IDLE_LABEL = 'No activity yet';

/** The session lists' one recency order, over the joined rows. */
export const compareSessionRecency = byLastActive<SessionTableRow>(
  row => row.lastActiveAt,
);

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

const SESSION_DAY_BUCKETS = [
  { id: 'today', daysBack: 0 },
  { id: 'yesterday', daysBack: 1 },
] as const;

/**
 * The day group of a session last active at `activeAt` (epoch ms), in the
 * reader's local calendar. A time later than `now` (clock skew) counts as
 * today; an unknown one as earlier.
 */
export function sessionDayGroup(
  activeAt: number | undefined,
  now: Date,
): SessionDayGroup {
  return dayBucket(activeAt, now, SESSION_DAY_BUCKETS, 'earlier');
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
  return group === 'today' || group === 'yesterday'
    ? formatLocalTime(date)
    : formatLocalDay(date, currentYear);
}

/** How wide the session's badges are beside its title, px, with their gap. */
const RUNTIME_LOST_BADGE_WIDTH = 80;
const EARLIER_REVISION_BADGE_WIDTH = 90;

/** The least of a title beside its badges, px, with the cell's padding. */
const TITLE_BESIDE_BADGES_MIN_WIDTH = 24 + 64;

/**
 * The least the Session column (the one without a width) reads at: a
 * name's minimum, or, beside the badges a listed session carries (which do
 * not shrink), their width and room for a few words of its title.
 */
export function sessionColumnMinWidth(
  rows: ReadonlyArray<{ runtimeLost?: boolean; earlierRevision?: boolean }>,
): number {
  const badges = (row: (typeof rows)[number]) =>
    (row.runtimeLost ? RUNTIME_LOST_BADGE_WIDTH : 0) +
    (row.earlierRevision ? EARLIER_REVISION_BADGE_WIDTH : 0);
  const widest = rows.reduce((most, row) => Math.max(most, badges(row)), 0);
  return Math.max(
    TABLE_NAME_COLUMN_MIN_WIDTH,
    TITLE_BESIDE_BADGES_MIN_WIDTH + widest,
  );
}

/**
 * The narrowest container that shows `columns` with every header and value
 * whole: the pixel columns, the session's column at `sessionMinWidth`, and
 * the columns given a share of the table at their `minWidth`. Shares of
 * 100% or more leave nothing for the session: no width fits, Infinity.
 */
export function shellColumnsMinWidth(
  columns: ReadonlyArray<{ width?: string; minWidth?: number }>,
  sessionMinWidth: number = TABLE_NAME_COLUMN_MIN_WIDTH,
): number {
  let fixed = sessionMinWidth;
  let share = 0;
  let floor = 0;
  for (const { width, minWidth = 0 } of columns) {
    if (width?.endsWith('px')) {
      fixed += parseFloat(width);
    } else if (width?.endsWith('%')) {
      const fraction = parseFloat(width) / 100;
      share += fraction;
      floor = Math.max(floor, minWidth / fraction);
    }
  }
  if (share >= 1) {
    return Infinity;
  }
  return Math.ceil(Math.max(fixed / (1 - share), floor));
}
