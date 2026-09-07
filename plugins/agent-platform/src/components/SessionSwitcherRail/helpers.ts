import {
  AWAITING_INPUT_STATES,
  describeSessionState,
  SessionStateEntry,
  SessionStateTone,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { SessionRow } from '../SessionsDataProvider/helpers';

/**
 * How long a finished session stays in the rail after its last response.
 *
 * Without it, a session vanishes the instant its turn completes — which is the
 * moment you are most likely to want it, because the reply you were waiting for
 * has just landed and the next thing you do is read it. An hour covers coming
 * back from a meeting, which is the interruption that actually happens; the cost
 * is that the rail leans further towards "what I was doing" and away from a pure
 * triage queue, which is the trade-off in the dial.
 *
 * This is *not* `ACTIVE_MAX_AGE_MS`, which bounds how long an active state is
 * believed. This bounds how long a **terminal** one is still worth showing.
 */
export const RECENTLY_FINISHED_GRACE_MS = 60 * 60_000;

/** The groups the rail can show, in the order it shows them. */
export const GROUP_ORDER = ['waiting', 'running', 'recent'] as const;

export type RailGroupKey = (typeof GROUP_ORDER)[number];

export const GROUP_LABELS: Record<RailGroupKey, string> = {
  waiting: 'Waiting',
  running: 'Running',
  recent: 'Recently finished',
};

/** Tone per group, resolved to a colour by the component that draws the dot. */
export const GROUP_TONES: Record<RailGroupKey, SessionStateTone> = {
  waiting: 'warning',
  running: 'info',
  // Neutral on purpose: these are done. The group exists so a just-answered
  // session is still reachable, not to draw the eye back to it.
  recent: 'neutral',
};

export type RailSession = {
  row: SessionRow;
  /** Epoch ms the state last moved; undefined when nothing in the conversation says. */
  changedAt?: number;
};

export type RailGroup = {
  key: RailGroupKey;
  label: string;
  tone: SessionStateTone;
  sessions: RailSession[];
};

/**
 * Overlay the detail page's own reading of the session it is showing.
 *
 * The backend's summary is cached for 15 s and computed from its own kagent
 * reads, so it is structurally behind the page: send a message on a finished
 * session and the rail would keep calling it finished — worse, it would file it
 * under "Recently finished" while the agent is visibly working three inches to
 * the right. The page polls that session's tasks directly and additionally knows
 * about a send still in flight, so for this one session it is always the better
 * source. Every *other* entry is left to the summary.
 *
 * Returns the same map when there is nothing to overlay, so the memo downstream
 * is not invalidated on every render.
 */
export function withCurrentSessionState(
  states: Map<string, SessionStateEntry>,
  override: SessionStateEntry | undefined,
): Map<string, SessionStateEntry> {
  if (!override) {
    return states;
  }
  const merged = new Map(states);
  merged.set(override.sessionId, override);
  return merged;
}

/**
 * Bucket the caller's sessions into the rail's groups.
 *
 * Three rules, each of which is a product decision rather than a mechanical one:
 *
 * **Active states, plus finished ones for a grace window.** A session whose
 * newest task reported no state at all — created and never run — is excluded
 * outright: "no activity yet" is not "non-terminal", and a rail claiming
 * otherwise would send someone to look at an empty conversation. A *terminal*
 * state lingers in its own group for {@link RECENTLY_FINISHED_GRACE_MS}, because
 * the instant a turn completes is exactly when its session is most worth
 * reaching — the reply just landed. An unrecognised state counts as terminal,
 * which `describeSessionState` already decides: we cannot promise a session is
 * live on the strength of a word we do not know.
 *
 * **`ACTIVE_MAX_AGE_MS` is deliberately not applied.** That five-minute bound
 * exists so the composer's "Working…" indicator stops claiming progress after an
 * agent dies mid-turn. The rail answers a different question. A session stuck in
 * `working` for three days is exactly what an operator needs to see — in RUNNING,
 * with `3d` on its first line — and hiding it would make the rail quietly wrong
 * in precisely the case someone opened it for. Running's newest-first sort sinks
 * the dead ones to the bottom on its own.
 *
 * **Sorting differs per group**, because each answers a different "what is most
 * urgent". Waiting is longest-blocked first: the session nobody has answered for
 * two days is the one to answer. Running is most-recently-active first: the
 * freshest progress is the interesting progress. A uniform last-activity sort
 * would bury an old blocked session every time something newer twitched.
 */
export function groupActiveSessions(
  rows: SessionRow[],
  states: Map<string, SessionStateEntry>,
  now: number,
): RailGroup[] {
  const buckets: Record<RailGroupKey, RailSession[]> = {
    waiting: [],
    running: [],
    recent: [],
  };

  for (const row of rows) {
    const entry = states.get(row.sessionId);
    const state = describeSessionState(entry?.state ?? undefined);
    if (!state) {
      continue;
    }

    if (!state.isActive) {
      // A finished session lingers for the grace window, in its own group. One
      // with no usable `changedAt` cannot be placed in time at all, so it is
      // dropped rather than shown indefinitely — the same "unknown is not zero"
      // rule the age formatter keeps.
      if (
        entry?.changedAt !== undefined &&
        now - entry.changedAt < RECENTLY_FINISHED_GRACE_MS
      ) {
        buckets.recent.push({ row, changedAt: entry.changedAt });
      }
      continue;
    }

    const key: RailGroupKey = AWAITING_INPUT_STATES.has(state.key)
      ? 'waiting'
      : 'running';
    buckets[key].push({ row, changedAt: entry?.changedAt });
  }

  buckets.waiting.sort((a, b) => byChangedAt(a, b, 'asc'));
  buckets.running.sort((a, b) => byChangedAt(a, b, 'desc'));
  buckets.recent.sort((a, b) => byChangedAt(a, b, 'desc'));

  return GROUP_ORDER.filter(key => buckets[key].length > 0).map(key => ({
    key,
    label: GROUP_LABELS[key],
    tone: GROUP_TONES[key],
    sessions: buckets[key],
  }));
}

/**
 * Order two sessions by when their state last moved.
 *
 * A session with no usable `changedAt` sorts **last in either direction**, which
 * matches `sortSessionRows`' convention for unknown timestamps. Sorting it first
 * in the ascending case would put "we don't know how long this has been blocked"
 * at the top of the list of longest-blocked sessions, which is the one position
 * that actively misleads.
 */
function byChangedAt(
  a: RailSession,
  b: RailSession,
  direction: 'asc' | 'desc',
): number {
  if (a.changedAt === undefined && b.changedAt === undefined) return 0;
  if (a.changedAt === undefined) return 1;
  if (b.changedAt === undefined) return -1;
  return direction === 'asc'
    ? a.changedAt - b.changedAt
    : b.changedAt - a.changedAt;
}

/**
 * The rail header's "N non-terminal".
 *
 * Deliberately excludes the `recent` group: those sessions *are* terminal, and
 * counting them under that word would make the number wrong to keep a heading
 * honest.
 */
export function countSessions(groups: RailGroup[]): number {
  return groups
    .filter(group => group.key !== 'recent')
    .reduce((total, group) => total + group.sessions.length, 0);
}
