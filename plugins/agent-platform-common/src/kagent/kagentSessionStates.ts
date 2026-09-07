import { z } from 'zod';

/**
 * One session's derived state, as the `session-states` route reports it.
 *
 * Unlike everything else in this package, the shape is **ours** rather than
 * kagent's — the backend computes it. It lives here anyway because both ends
 * depend on it, and a summary the backend writes and the frontend reads
 * differently is the same class of bug that put the parsers here to begin with.
 */
export type SessionStateEntry = {
  sessionId: string;
  /**
   * The A2A state verbatim, or `null` when the session has tasks but none
   * reported a state — created and never run.
   *
   * Left raw rather than mapped to a label or tone: `describeSessionState`
   * already owns that, and keeping the wire honest means the rail's wording is a
   * frontend-only change.
   */
  state: string | null;
  /** Epoch ms the state last moved, when anything in the conversation says. */
  changedAt?: number;
};

export type SessionStatesResponse = {
  /** Epoch ms the summary was computed. */
  evaluatedAt: number;
  states: SessionStateEntry[];
  /**
   * Sessions whose task read failed. Their state is genuinely unknown — which is
   * not the same as terminal, and not the same as never evaluated.
   */
  unreadable: string[];
  /**
   * Listable sessions that *should* have been evaluated and were not: past the
   * cap, or cut off by the pass budget.
   *
   * Deliberately **excludes** the activity-window exclusion, which is a scope
   * decision rather than a shortfall. Folding it in here would make this
   * permanently non-zero for any account holding a session older than the
   * window — the normal state after a week — and the UI reads a non-zero value
   * as "we could not tell".
   */
  skipped: number;
};

const sessionStateEntrySchema = z.looseObject({
  sessionId: z.string(),
  state: z.string().nullable().optional(),
  changedAt: z.number().optional(),
});

const sessionStatesSchema = z.looseObject({
  evaluatedAt: z.number().optional(),
  states: z.array(z.unknown()).optional(),
  unreadable: z.array(z.unknown()).optional(),
  skipped: z.number().optional(),
});

/**
 * Parse a `session-states` body.
 *
 * **Never throws, and never fails whole.** The rail is an aid beside a page that
 * works without it, so the failure that matters is losing every row to one bad
 * one: entries are validated individually and a malformed one is dropped, in the
 * same spirit as `normalizeSessionList`. A body that is not an object at all
 * yields an empty summary rather than an exception.
 */
export function normalizeSessionStates(raw: unknown): SessionStatesResponse {
  const parsed = sessionStatesSchema.safeParse(raw);
  if (!parsed.success) {
    return { evaluatedAt: 0, states: [], unreadable: [], skipped: 0 };
  }

  const states: SessionStateEntry[] = [];
  for (const candidate of parsed.data.states ?? []) {
    const entry = sessionStateEntrySchema.safeParse(candidate);
    if (!entry.success || !entry.data.sessionId) {
      continue;
    }
    states.push({
      sessionId: entry.data.sessionId,
      state: entry.data.state ?? null,
      ...(entry.data.changedAt === undefined
        ? {}
        : { changedAt: entry.data.changedAt }),
    });
  }

  return {
    evaluatedAt: parsed.data.evaluatedAt ?? 0,
    states,
    unreadable: (parsed.data.unreadable ?? []).filter(
      (id): id is string => typeof id === 'string',
    ),
    skipped: parsed.data.skipped ?? 0,
  };
}
