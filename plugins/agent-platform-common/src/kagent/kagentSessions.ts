import {
  agentInstanceEnvelopeWireSchema,
  agentInstanceListWireSchema,
  isAgentInstanceEnvelope,
  isAgentInstanceList,
  normalizeAgentInstance,
  parseAgentInstanceWire,
} from './kagentAgentInstance';
import {
  KagentSessionWire,
  kagentCreatedSessionSchema,
  kagentSessionListSchema,
  kagentSessionWireSchema,
} from './kagentSchema';
import { normalizeTimestamp } from './kagentTimestamp';

export { normalizeTimestamp } from './kagentTimestamp';

/**
 * Stable, UI-facing session shape.
 *
 * Deliberately decoupled from the wire: a kagent schema change is absorbed in
 * `normalizeSession` / `normalizeAgentInstance` rather than rippling through
 * every component. kagent ships no OpenAPI spec and the fleet can run mixed
 * versions, so this boundary is the only thing keeping version drift out of
 * the UI.
 *
 * On the kagent API v2 line a session **is** an AgentInstance; the fields
 * below `updatedAt` are what an instance says about itself and a 0.10 session
 * never did.
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
  /**
   * The agent, encoded as kagent's python identifier (`ns__NS__agent_name`) —
   * verbatim from a 0.10 session, derived from an instance's template. What the
   * frontend joins agents on, because encoding is lossless and decoding is not.
   */
  agentId?: string;
  /** 'user' | 'agent' | any future value, verbatim; undefined when absent. */
  source?: string;
  /** RFC3339, guaranteed parseable and not Go zero time; undefined otherwise. */
  createdAt?: string;
  updatedAt?: string;
  /** The AgentTemplate an instance runs — the agent's real namespace and name. */
  agentTemplate?: { namespace: string; name: string };
  /**
   * An instance's lifecycle state as one lower-case word (`ready`,
   * `suspended`, `creating`, `failed`, `deleting`), for what the instance says
   * about itself. Not a turn state: a suspended instance may be idle after a
   * finished turn or waiting on a human, and only its tasks can tell.
   */
  state?: string;
  /** The A2A context every turn of the instance shares. */
  contextId?: string;
  /** Why a `failed` instance failed, in the controller's words. */
  failure?: { reason?: string; message?: string };
};

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
 * Parse and normalize a raw session list: a `ListAgentInstancesResponse`
 * (`{agentInstances: […]}`, the API v2 line) or a 0.10 `GET /api/sessions`
 * envelope.
 *
 * Never throws: the worst case is an empty list plus a `drift` note. That
 * matters because this runs against whatever kagent version an installation
 * happens to be on.
 */
export function normalizeSessionList(
  raw: unknown,
  installation: string,
): NormalizedSessionList {
  if (isAgentInstanceList(raw)) {
    return normalizeAgentInstanceList(raw, installation);
  }

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

/**
 * The API v2 half of {@link normalizeSessionList}: one row per instance,
 * validated one at a time so a malformed row is skipped rather than costing the
 * list. An absent `agentInstances` is an empty result (proto3 JSON omits an
 * empty repeated field), never drift.
 */
function normalizeAgentInstanceList(
  raw: unknown,
  installation: string,
): NormalizedSessionList {
  const parsed = agentInstanceListWireSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      sessions: [],
      drift: { kind: 'unparseable-body', message: 'unparseable response body' },
    };
  }
  const sessions: KagentSession[] = [];
  let skippedRows = 0;
  for (const row of parsed.data.agentInstances ?? []) {
    const wire = parseAgentInstanceWire(row);
    if (!wire || !wire.id) {
      skippedRows += 1;
      continue;
    }
    sessions.push(normalizeAgentInstance(wire, installation));
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

/**
 * The id of a session kagent has just created.
 *
 * Unlike the list, this cannot degrade gracefully: without an id there is no
 * session to open, so every unreadable shape has to become a message the user
 * can act on rather than an `undefined` that would navigate nowhere. The caller
 * turns `undefined` into that message.
 *
 * The envelope's `error` flag is checked as well as the body, because kagent
 * reports a refusal with a 200 and `{error: true}` on some paths — a shape the
 * status code alone would let through.
 */
export function parseCreatedSessionId(raw: unknown): string | undefined {
  if (isAgentInstanceEnvelope(raw)) {
    const parsed = agentInstanceEnvelopeWireSchema.safeParse(raw);
    return parsed.success
      ? parseAgentInstanceWire(parsed.data.agentInstance)?.id
      : undefined;
  }

  const parsed = kagentCreatedSessionSchema.safeParse(raw);
  if (!parsed.success || parsed.data.isError) {
    return undefined;
  }

  return parseSessionWire(parsed.data.session)?.id;
}

/**
 * Whether a session belongs in a user-facing list.
 *
 * A2A subagent sessions (`source === 'agent'`) are child threads spawned by a
 * parent agent, not work the user started, so they are excluded.
 *
 * Note this is forward-compatibility rather than active filtering: live kagent
 * v0.9.9 responses omit `source` entirely, so nothing is hidden today. An absent
 * or unrecognised value is listable — only an explicit `'agent'` is not.
 *
 * Shared with the backend, which applies the same rule before spending a task
 * read on a session: the two must agree about what a session even is.
 */
export function isListableSession(session: KagentSession): boolean {
  return session.source !== 'agent';
}
