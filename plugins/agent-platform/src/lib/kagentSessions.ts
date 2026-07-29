import {
  KagentSessionWire,
  kagentSessionListSchema,
  kagentSessionWireSchema,
} from './kagentSchema';

/**
 * Stable, UI-facing session shape.
 *
 * Deliberately decoupled from the wire: a kagent schema change is absorbed in
 * `normalizeSession` rather than rippling through every component. kagent ships
 * no OpenAPI spec and the fleet can run mixed versions, so this boundary is the
 * only thing keeping version drift out of the UI.
 */
export type KagentSession = {
  /** `${installation}/${sessionId}` — unique fleet-wide; the table row key. */
  id: string;
  /**
   * kagent's own session id, verbatim. Opaque: real responses mix 64-character
   * hex strings and UUIDs, so nothing may assume a format.
   */
  sessionId: string;
  installation: string;
  /** Session title; undefined when kagent has none (the UI falls back). */
  title?: string;
  /** Raw kagent `agent_id` python identifier (`ns__NS__agent_name`). */
  agentId?: string;
  /** 'user' | 'agent' | any future value, verbatim; undefined when absent. */
  source?: string;
  /** RFC3339, guaranteed parseable and not Go zero time; undefined otherwise. */
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Earliest plausible timestamp. Anything older is a zero value in some
 * encoding, not real data.
 */
const EARLIEST_PLAUSIBLE_YEAR = 1971;

/**
 * kagent serializes `created_at`/`updated_at` as non-pointer `time.Time`, so an
 * unset value arrives as Go zero time (`0001-01-01T00:00:00Z`) — which browsers
 * cheerfully render as "Dec 31, 0000". Reject that, anything unparseable, and
 * anything implausibly old, so callers can render a dash instead.
 */
export function normalizeTimestamp(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  if (new Date(parsed).getUTCFullYear() < EARLIEST_PLAUSIBLE_YEAR) {
    return undefined;
  }
  return value;
}

/** Map one parsed wire session onto the domain type. */
export function normalizeSession(
  wire: KagentSessionWire,
  installation: string,
): KagentSession {
  const sessionId = wire.id ?? '';
  return {
    id: `${installation}/${sessionId}`,
    sessionId,
    installation,
    title: wire.name,
    agentId: wire.agent_id,
    source: wire.source,
    createdAt: normalizeTimestamp(wire.created_at),
    updatedAt: normalizeTimestamp(wire.updated_at),
  };
}

/**
 * Stable identifier for a kind of response drift.
 *
 * Kept separate from the human-readable message so callers can deduplicate
 * logging on the kind: the `skipped-rows` message embeds a varying count, so
 * keying on the formatted string would defeat any dedupe.
 */
export type SessionListDriftKind =
  | 'unparseable-body'
  | 'error-envelope'
  | 'data-not-array'
  | 'skipped-rows'
  // A readable 200 that held no payload where one was expected. Distinct from
  // `skipped-rows`, whose message counts dropped rows — reusing that kind for
  // "the response carried no session" reported it as though rows were lost.
  | 'missing-payload';

export type SessionListDrift = {
  kind: SessionListDriftKind;
  message: string;
};

export type NormalizedSessionList = {
  sessions: KagentSession[];
  /**
   * Set when the response did not look the way we expect. The sessions we could
   * read are still returned — drift is reported, never fatal.
   */
  drift?: SessionListDrift;
};

/**
 * Parse and normalize a raw `GET /api/sessions` body.
 *
 * Never throws: the worst case is an empty list plus a `drift` note. That
 * matters because this runs against whatever kagent version an installation
 * happens to be on.
 */
export function normalizeSessionList(
  raw: unknown,
  installation: string,
): NormalizedSessionList {
  const parsed = kagentSessionListSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      sessions: [],
      drift: { kind: 'unparseable-body', message: 'unparseable response body' },
    };
  }

  // Validate row by row so one malformed entry is skipped instead of costing us
  // the whole list. A row without an id is unusable (it keys the table and
  // identifies the session), so it counts as skipped too.
  const sessions: KagentSession[] = [];
  let skippedRows = 0;
  for (const row of parsed.data.rows) {
    const wire = parseSessionWire(row);
    if (!wire || !wire.id) {
      skippedRows += 1;
      continue;
    }
    sessions.push(normalizeSession(wire, installation));
  }

  // kagent can report a failure in-band on a 200: the backend classifies only on
  // HTTP status and passes any 2xx body through verbatim, so the envelope's
  // `error` flag is ours to check. Without this an `{error: true, data: null}`
  // response would be indistinguishable from "this user has no sessions".
  if (parsed.data.isError) {
    return {
      sessions,
      drift: {
        kind: 'error-envelope',
        message:
          parsed.data.message ?? 'kagent reported an error in the envelope',
      },
    };
  }

  // An envelope whose `data` key exists but held something other than an array
  // is the interesting case: `data` legitimately absent just means "no
  // sessions", but a non-array means the contract moved.
  const dataValue =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as { data?: unknown }).data
      : undefined;
  const hadDataKey = dataValue !== null && dataValue !== undefined;

  if (hadDataKey && !parsed.data.hadDataArray) {
    return {
      sessions,
      drift: {
        kind: 'data-not-array',
        message: 'data was present but not an array',
      },
    };
  }

  if (skippedRows > 0) {
    return {
      sessions,
      drift: {
        kind: 'skipped-rows',
        message: `skipped ${skippedRows} unreadable session ${
          skippedRows === 1 ? 'row' : 'rows'
        }`,
      },
    };
  }

  return { sessions };
}

/** Parse a single wire session, for callers that already have one. */
export function parseSessionWire(raw: unknown): KagentSessionWire | undefined {
  const parsed = kagentSessionWireSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
