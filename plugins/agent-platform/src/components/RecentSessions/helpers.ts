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
