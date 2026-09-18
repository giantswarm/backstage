import {
  AWAITING_INPUT_STATES,
  describeSessionState,
  FAILED_STATES,
  SessionState,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { SessionRow } from '../SessionsDataProvider/helpers';

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
};

/**
 * Order the State column sorts in, ascending: what needs a person first.
 *
 * Alphabetical labels would put "Completed" above "Waiting for input", which
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

/**
 * Sort by the State column: by {@link stateRank}, then by the same last-activity
 * order the rest of the table falls back to, so two waiting sessions still read
 * newest first instead of in whatever order the fleet answered in.
 */
export function sortSessionsByState(
  rows: SessionTableRow[],
  direction: 'ascending' | 'descending',
): SessionTableRow[] {
  const factor = direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a.stateRank !== b.stateRank) {
      return (a.stateRank - b.stateRank) * factor;
    }
    const aTime = changedAtOf(a);
    const bTime = changedAtOf(b);
    if (aTime === bTime) {
      return a.title.localeCompare(b.title);
    }
    // Unknown last in either direction, as everywhere else in this table.
    if (aTime === undefined) return 1;
    if (bTime === undefined) return -1;
    return bTime - aTime;
  });
}

function changedAtOf(row: SessionTableRow): number | undefined {
  if (row.stateCell.kind === 'state' && row.stateCell.changedAt !== undefined) {
    return row.stateCell.changedAt;
  }
  if (!row.updatedAt) {
    return undefined;
  }
  const parsed = Date.parse(row.updatedAt);
  return Number.isNaN(parsed) ? undefined : parsed;
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
    return { ...row, stateCell: cell, stateRank: stateRank(cell) };
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
