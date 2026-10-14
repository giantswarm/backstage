import { z } from 'zod';
import { wireString } from './kagentSchema';
import type { KagentSession } from './kagentSessions';
import { normalizeTimestamp } from './kagentTimestamp';
import { isRecord } from './record';

/**
 * Wire shapes of the kagent API v2 `SessionService`, as the backend relays
 * them: the **proto3 JSON** of the controller's responses
 * (`ListSessionsResponse`, `CreateSessionResponse`, …), camelCase field names,
 * enums as their names, timestamps as RFC 3339.
 *
 * A Session record is one conversation of one person with one Agent, kept in
 * the controller's database. The shapes are as permissive as the 0.10 ones
 * beside them and for the same reason — the backend is transport, tolerance
 * lives here, and one renamed field must cost a field, never a row.
 */

const resourceReferenceWireSchema = z.looseObject({
  namespace: wireString,
  name: wireString,
});

/**
 * One Session record. `state` and `operation` are enum names on the wire
 * (`RUNTIME_STATE_READY`); they are read permissively and normalised by
 * {@link normalizeRuntimeState}, so an enum value this layer has not seen
 * still renders as itself.
 */
export const sessionRecordWireSchema = z.looseObject({
  id: wireString,
  creator: wireString,
  agent: resourceReferenceWireSchema.nullish().catch(undefined),
  state: wireString,
  operation: wireString,
  failure: z
    .looseObject({ reason: wireString, message: wireString })
    .nullish()
    .catch(undefined),
  createdAt: wireString,
  updatedAt: wireString,
  name: wireString,
  contextId: wireString,
});

export type SessionRecordWire = z.infer<typeof sessionRecordWireSchema>;

/**
 * `ListSessionsResponse`. `sessions` is absent on the wire when the list is
 * empty (proto3 JSON omits an empty repeated field), so absence is an empty
 * result, exactly as a missing `data` was on the 0.10 envelope.
 */
export const sessionRecordListWireSchema = z.looseObject({
  // `unknown[]`: rows are validated one at a time by the caller so a single
  // malformed row is skipped rather than failing the whole list.
  sessions: z.array(z.unknown()).nullish().catch(undefined),
});

/**
 * The one-session responses (`Create…`, `Get…`, `UpdateSessionName…`,
 * `Delete…`), all `{session}`.
 */
export const sessionRecordEnvelopeWireSchema = z.looseObject({
  session: z.unknown().optional(),
});

/** Whether a body is a `ListSessionsResponse` rather than a 0.10 list. */
export function isSessionRecordList(raw: unknown): boolean {
  return isRecord(raw) && 'sessions' in raw && !('data' in raw);
}

/**
 * Whether a body is a one-session response rather than a 0.10 envelope. A
 * 0.10 detail nests its session under `data`; the record envelope carries it
 * as proto3 JSON at the top.
 */
export function isSessionRecordEnvelope(raw: unknown): boolean {
  return (
    isRecord(raw) &&
    'session' in raw &&
    !('data' in raw) &&
    !('read_only' in raw) &&
    !('events' in raw) &&
    (raw.session === undefined || isRecord(raw.session)) &&
    !(isRecord(raw.session) && 'agent_id' in raw.session)
  );
}

const RUNTIME_STATE_PREFIX = 'RUNTIME_STATE_';

/**
 * A runtime state as one lower-case word: `RUNTIME_STATE_SUSPENDED` →
 * `suspended`. A value without the prefix passes through lower-cased, so a
 * future spelling still renders as itself.
 */
export function normalizeRuntimeState(
  state: string | undefined,
): string | undefined {
  if (!state) {
    return undefined;
  }
  const bare = state.startsWith(RUNTIME_STATE_PREFIX)
    ? state.slice(RUNTIME_STATE_PREFIX.length)
    : state;
  return bare.toLowerCase().replace(/_/g, '-');
}

/**
 * kagent's encoding of an agent reference as a 0.10 session's `agent_id`: the
 * "python identifier" form, `<namespace>__NS__<name>` with every `-` rewritten
 * to `_`. Lossless to encode, lossy to decode — so both sides of the
 * session-to-agent join encode with this one function and never decode. A
 * Session record carries its Agent's namespace and name outright; the encoded
 * id is derived from them so the join the frontend already makes keeps working
 * unchanged.
 */
export function encodeKagentAgentId(namespace: string, name: string): string {
  return `${namespace}/${name}`.replace(/-/g, '_').replace('/', '__NS__');
}

/** Parse a single wire record, for callers that already have one. */
export function parseSessionRecordWire(
  raw: unknown,
): SessionRecordWire | undefined {
  const parsed = sessionRecordWireSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Map one parsed Session record onto the session domain type.
 *
 * `source` is `'user'`: every session the controller lists for a caller was
 * created by a surface acting as that person (a child agent's work is not a
 * session of theirs), so the listable filter keeps them all.
 */
export function normalizeSessionRecord(
  wire: SessionRecordWire,
  installation: string,
): KagentSession {
  const sessionId = wire.id ?? '';
  const agent =
    wire.agent?.namespace && wire.agent?.name
      ? { namespace: wire.agent.namespace, name: wire.agent.name }
      : undefined;
  const failure =
    wire.failure && (wire.failure.reason || wire.failure.message)
      ? {
          ...(wire.failure.reason && { reason: wire.failure.reason }),
          ...(wire.failure.message && { message: wire.failure.message }),
        }
      : undefined;
  return {
    id: `${installation}/${sessionId}`,
    sessionId,
    installation,
    title: wire.name,
    agentId: agent
      ? encodeKagentAgentId(agent.namespace, agent.name)
      : undefined,
    source: 'user',
    createdAt: normalizeTimestamp(wire.createdAt),
    updatedAt: normalizeTimestamp(wire.updatedAt),
    ...(agent && { agent }),
    ...(wire.state && { state: normalizeRuntimeState(wire.state) }),
    ...(wire.contextId && { contextId: wire.contextId }),
    ...(failure && { failure }),
  };
}
