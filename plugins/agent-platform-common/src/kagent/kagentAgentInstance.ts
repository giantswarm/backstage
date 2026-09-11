import { z } from 'zod';
import { wireString } from './kagentSchema';
import type { KagentSession } from './kagentSessions';
import { normalizeTimestamp } from './kagentTimestamp';

/**
 * Wire shapes of the kagent API v2 `AgentInstanceService`, as the backend
 * relays them: the **proto3 JSON** of the controller's responses
 * (`ListAgentInstancesResponse`, `CreateAgentInstanceResponse`, …), camelCase
 * field names, enums as their names, timestamps as RFC 3339.
 *
 * An AgentInstance **is** a session (plan decision D10): one conversation of
 * one person with one AgentTemplate on one Harness. The shapes are as
 * permissive as the 0.10 ones beside them and for the same reason — the
 * backend is transport, tolerance lives here, and one renamed field must cost a
 * field, never a row.
 */

const resourceReferenceWireSchema = z.looseObject({
  namespace: wireString,
  name: wireString,
});

/**
 * One AgentInstance. `state` and `operation` are enum names on the wire
 * (`AGENT_INSTANCE_STATE_READY`); they are read permissively and normalised
 * by {@link normalizeAgentInstanceState}, so an enum value this layer has not
 * seen still renders as itself.
 */
export const agentInstanceWireSchema = z.looseObject({
  id: wireString,
  creator: wireString,
  harness: resourceReferenceWireSchema.nullish().catch(undefined),
  agentTemplate: resourceReferenceWireSchema.nullish().catch(undefined),
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

export type AgentInstanceWire = z.infer<typeof agentInstanceWireSchema>;

/**
 * `ListAgentInstancesResponse`. `agentInstances` is absent on the wire when
 * the list is empty (proto3 JSON omits an empty repeated field), so absence is
 * an empty result, exactly as a missing `data` was on the 0.10 envelope.
 */
export const agentInstanceListWireSchema = z.looseObject({
  // `unknown[]`: rows are validated one at a time by the caller so a single
  // malformed row is skipped rather than failing the whole list.
  agentInstances: z.array(z.unknown()).nullish().catch(undefined),
});

/**
 * The one-instance responses (`Create…`, `Get…`, `UpdateAgentInstanceName…`,
 * `Delete…`), all `{agentInstance}`.
 */
export const agentInstanceEnvelopeWireSchema = z.looseObject({
  agentInstance: z.unknown().optional(),
});

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/** Whether a body is a `ListAgentInstancesResponse` rather than a 0.10 list. */
export function isAgentInstanceList(raw: unknown): boolean {
  return isRecord(raw) && 'agentInstances' in raw && !('data' in raw);
}

/** Whether a body is a one-instance response rather than a 0.10 envelope. */
export function isAgentInstanceEnvelope(raw: unknown): boolean {
  return isRecord(raw) && 'agentInstance' in raw && !('data' in raw);
}

const INSTANCE_STATE_PREFIX = 'AGENT_INSTANCE_STATE_';

/**
 * An instance state as one lower-case word: `AGENT_INSTANCE_STATE_SUSPENDED`
 * → `suspended`. A value without the prefix passes through lower-cased, so a
 * future spelling still renders as itself.
 */
export function normalizeAgentInstanceState(
  state: string | undefined,
): string | undefined {
  if (!state) {
    return undefined;
  }
  const bare = state.startsWith(INSTANCE_STATE_PREFIX)
    ? state.slice(INSTANCE_STATE_PREFIX.length)
    : state;
  return bare.toLowerCase().replace(/_/g, '-');
}

/**
 * kagent's encoding of an agent reference as a 0.10 session's `agent_id`: the
 * "python identifier" form, `<namespace>__NS__<name>` with every `-` rewritten
 * to `_`. Lossless to encode, lossy to decode — so both sides of the
 * session-to-agent join encode with this one function and never decode. An
 * AgentInstance carries its template's namespace and name outright; the
 * encoded id is derived from them so the join the frontend already makes
 * keeps working unchanged.
 */
export function encodeKagentAgentId(namespace: string, name: string): string {
  return `${namespace}/${name}`.replace(/-/g, '_').replace('/', '__NS__');
}

/** Parse a single wire instance, for callers that already have one. */
export function parseAgentInstanceWire(
  raw: unknown,
): AgentInstanceWire | undefined {
  const parsed = agentInstanceWireSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Map one parsed AgentInstance onto the session domain type.
 *
 * `source` is `'user'`: every instance the controller lists for a caller was
 * created by a surface acting as that person (a child agent's work is not an
 * instance of theirs), so the listable filter keeps them all.
 */
export function normalizeAgentInstance(
  wire: AgentInstanceWire,
  installation: string,
): KagentSession {
  const sessionId = wire.id ?? '';
  const template =
    wire.agentTemplate?.namespace && wire.agentTemplate?.name
      ? {
          namespace: wire.agentTemplate.namespace,
          name: wire.agentTemplate.name,
        }
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
    agentId: template
      ? encodeKagentAgentId(template.namespace, template.name)
      : undefined,
    source: 'user',
    createdAt: normalizeTimestamp(wire.createdAt),
    updatedAt: normalizeTimestamp(wire.updatedAt),
    ...(template && { agentTemplate: template }),
    ...(wire.state && { state: normalizeAgentInstanceState(wire.state) }),
    ...(wire.contextId && { contextId: wire.contextId }),
    ...(failure && { failure }),
  };
}
