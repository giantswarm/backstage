import { z } from 'zod';
import { ASK_USER_TOOL_NAME, CONFIRMATION_TOOL_NAME } from './kagentParts';
import { wireString } from './kagentSchema';

/**
 * The A2A **v1** wire, as the kagent API v2 controller speaks it over gRPC and
 * the backend relays it: the **proto3 JSON** of `lf.a2a.v1` messages —
 * camelCase fields, enums as their names (`TASK_STATE_WORKING`, `ROLE_USER`),
 * a `Part` as a oneof (`{text}` | `{data}` | `{url}` | `{raw}`), a
 * `StreamResponse` as a oneof (`{task}` | `{message}` | `{statusUpdate}` |
 * `{artifactUpdate}`).
 *
 * Everything downstream of this file — the timeline, the stream reducer, the
 * answer panel, the usage arithmetic, the session states — reads the shape the
 * legacy v0 wire had (`kind`-discriminated parts and events, lower-case
 * hyphenated states). Rather than teach every one of those readers two wires,
 * the v1 shapes are parsed here and **normalised into that one internal
 * shape**. So the parsers stay singular, the frontend stays transport-blind,
 * and the v0 fixtures keep pinning the readers while the v1 fixtures pin this
 * translation.
 *
 * Permissive like everything in this package: a field this layer does not
 * recognise passes through, a malformed one degrades to `undefined`, and a
 * task, message or part we cannot read costs itself and nothing else.
 */

const TASK_STATE_PREFIX = 'TASK_STATE_';

/**
 * An A2A state as the readers spell it: `TASK_STATE_INPUT_REQUIRED` →
 * `input-required`. A value without the prefix is already the legacy spelling
 * (or a future one) and passes through lower-cased.
 */
export function normalizeA2aState(
  state: string | undefined,
): string | undefined {
  if (!state) {
    return undefined;
  }
  if (!state.startsWith(TASK_STATE_PREFIX)) {
    // Not an enum name: the legacy spelling, or a future one, lower-cased and
    // otherwise left alone so it renders as itself.
    return state.toLowerCase();
  }
  return state.slice(TASK_STATE_PREFIX.length).toLowerCase().replace(/_/g, '-');
}

/** `ROLE_USER` → `user`, `ROLE_AGENT` → `agent`; a legacy value passes through. */
export function normalizeA2aRole(role: string | undefined): string | undefined {
  if (!role) {
    return undefined;
  }
  return role.startsWith('ROLE_')
    ? role.slice('ROLE_'.length).toLowerCase()
    : role;
}

/**
 * The states after which no further event follows on a turn. The v1 status
 * update carries no `final` flag; the stream reducer needs one to know the turn
 * is over, so it is derived: every terminal state, `input-required` included,
 * ends the events of this turn.
 */
const TERMINAL_STATES = new Set([
  'completed',
  'failed',
  'canceled',
  'rejected',
  'input-required',
  'auth-required',
]);

/**
 * kagent's human-in-the-loop A2A extension. A suspended task's
 * `status.message` carries the typed request under this key in its `metadata`
 * (and names the URI in `extensions`); the reply carries the typed response
 * the same way. Only when the client requested the extension on the turn —
 * which the backend does on every turn.
 */
export const HITL_EXTENSION_URI = 'https://kagent.dev/extensions/hitl/v1';

/** The instant kagent stamps on a history entry, as RFC 3339 in its metadata. */
const TIMELINE_POSITION_KEY = 'kagent.dev/timeline-position';

// --- Wire schemas ----------------------------------------------------------

export const a2aV1PartWireSchema = z.looseObject({
  text: wireString,
  raw: wireString,
  url: wireString,
  data: z.unknown().optional(),
  metadata: z.unknown().optional(),
  filename: wireString,
  mediaType: wireString,
});

export type A2aV1PartWire = z.infer<typeof a2aV1PartWireSchema>;

export const a2aV1MessageWireSchema = z.looseObject({
  messageId: wireString,
  contextId: wireString,
  taskId: wireString,
  role: wireString,
  parts: z.array(z.unknown()).nullish().catch(undefined),
  metadata: z.unknown().optional(),
  extensions: z.array(z.unknown()).nullish().catch(undefined),
});

export type A2aV1MessageWire = z.infer<typeof a2aV1MessageWireSchema>;

export const a2aV1ArtifactWireSchema = z.looseObject({
  artifactId: wireString,
  name: wireString,
  description: wireString,
  parts: z.array(z.unknown()).nullish().catch(undefined),
  metadata: z.unknown().optional(),
});

export const a2aV1TaskStatusWireSchema = z.looseObject({
  state: wireString,
  message: z.unknown().optional(),
  timestamp: wireString,
});

export const a2aV1TaskWireSchema = z.looseObject({
  id: wireString,
  contextId: wireString,
  status: a2aV1TaskStatusWireSchema.nullish().catch(undefined),
  artifacts: z.array(z.unknown()).nullish().catch(undefined),
  history: z.array(z.unknown()).nullish().catch(undefined),
  metadata: z.unknown().optional(),
});

export type A2aV1TaskWire = z.infer<typeof a2aV1TaskWireSchema>;

/**
 * `ListTasksResponse`. `tasks` is absent when the instance has no turn yet
 * (proto3 JSON omits an empty repeated field), which is an empty result.
 */
export const a2aV1TaskListWireSchema = z.looseObject({
  tasks: z.array(z.unknown()).nullish().catch(undefined),
  nextPageToken: wireString,
  pageSize: z.unknown().optional(),
  totalSize: z.unknown().optional(),
});

/** One `StreamResponse`: exactly one of the four payloads is set. */
export const a2aV1StreamResponseWireSchema = z.looseObject({
  task: z.unknown().optional(),
  message: z.unknown().optional(),
  statusUpdate: z.unknown().optional(),
  artifactUpdate: z.unknown().optional(),
});

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/** Whether a body is a `ListTasksResponse` rather than a 0.10 envelope. */
export function isA2aV1TaskList(raw: unknown): boolean {
  return isRecord(raw) && 'tasks' in raw && !('data' in raw);
}

/**
 * Whether a stream frame is a v1 `StreamResponse` rather than a legacy
 * `kind`-discriminated event. The legacy event always names its `kind`; the
 * v1 oneof never does.
 */
export function isA2aV1StreamResponse(raw: unknown): boolean {
  return (
    isRecord(raw) &&
    !('kind' in raw) &&
    ('task' in raw ||
      'message' in raw ||
      'statusUpdate' in raw ||
      'artifactUpdate' in raw)
  );
}

// --- Translation into the internal (legacy-shaped) wire --------------------

type Wire = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * One v1 part as a `kind`-discriminated part. Text, data and file keep their
 * metadata bag verbatim — it is where kagent's `{adk,kagent}_type`,
 * `_usage_metadata` and `_thought` markers live, and the readers are keyed on
 * those. A part with none of the four contents is passed through as what it is.
 */
export function toWirePart(raw: unknown): Wire | undefined {
  const parsed = a2aV1PartWireSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const part = parsed.data;
  const base = part.metadata === undefined ? {} : { metadata: part.metadata };
  if (part.text !== undefined) {
    return { kind: 'text', text: part.text, ...base };
  }
  if (part.data !== undefined) {
    return { kind: 'data', data: part.data, ...base };
  }
  if (part.url !== undefined || part.raw !== undefined) {
    return {
      kind: 'file',
      file: {
        ...(part.url !== undefined ? { uri: part.url } : { bytes: part.raw }),
        ...(part.mediaType && { mimeType: part.mediaType }),
        ...(part.filename && { name: part.filename }),
      },
      ...base,
    };
  }
  return { ...base };
}

/**
 * The HITL payload of a message, when it declares the extension and carries one.
 */
function readHitlPayload(
  message: A2aV1MessageWire,
): Record<string, unknown> | undefined {
  const extensions = Array.isArray(message.extensions)
    ? message.extensions
    : [];
  if (!extensions.includes(HITL_EXTENSION_URI)) {
    return undefined;
  }
  return asRecord(asRecord(message.metadata)?.[HITL_EXTENSION_URI]);
}

/**
 * The parts the readers understand for a HITL **request**: one ADK-style
 * confirmation call per tool the human decides on, wrapping the proposed call
 * exactly as the 0.10 runtime did (`adk_request_confirmation` with
 * `originalFunctionCall`). That is the shape `readPendingConfirmation` renders
 * the answer panel from and `buildTimeline` renders the approval card from —
 * and an `ask_user` request is the same wrapper around an `ask_user` call, with
 * the questions in its arguments, which is the discrimination both already make.
 *
 * Empty when the payload is not a request or names no tool, so nothing is
 * offered to answer on a shape this cannot read.
 */
function hitlRequestParts(payload: Record<string, unknown>): Wire[] {
  const type = asString(payload.type);
  const hint = asString(payload.hint);
  const confirmation = (
    approvalId: string,
    call: { id?: string; name?: string; args?: unknown },
  ): Wire => ({
    kind: 'data',
    data: {
      id: approvalId,
      name: CONFIRMATION_TOOL_NAME,
      args: {
        originalFunctionCall: {
          id: call.id ?? approvalId,
          name: call.name,
          args: call.args,
        },
        ...(hint && { toolConfirmation: { hint } }),
      },
    },
    metadata: { kagent_type: 'function_call', kagent_is_long_running: true },
  });

  if (type === 'tool_approval_request') {
    // A request propagated from a child agent names the child's tools under
    // `nested`; those are the ones a decision is validated against.
    const nested = asRecord(payload.nested);
    const source = Array.isArray(nested?.tools) ? nested.tools : payload.tools;
    return (Array.isArray(source) ? source : [])
      .map(asRecord)
      .filter((tool): tool is Record<string, unknown> => Boolean(tool))
      .map(tool => {
        const id = asString(tool.id);
        return id
          ? confirmation(id, {
              id: asString(tool.call_id),
              name: asString(tool.name),
              args: tool.args,
            })
          : undefined;
      })
      .filter((part): part is Wire => Boolean(part));
  }

  if (type === 'ask_user_request') {
    const id = asString(payload.id);
    if (!id) {
      return [];
    }
    return [
      confirmation(id, {
        id,
        name: ASK_USER_TOOL_NAME,
        args: { questions: payload.questions },
      }),
    ];
  }

  return [];
}

/**
 * The part the readers understand for a HITL **response**: the decision the
 * user made, as the `decision_type` data part `buildTimeline` resolves an
 * approval card's verdict from. A tool approval that approved every tool is an
 * approval, one that rejected any is a rejection (one confirmation is open at
 * a time, so the uniform reading is the true one); an answered question is an
 * approval carrying the answers positionally, as `ask_user_answers`.
 */
function hitlResponsePart(payload: Record<string, unknown>): Wire | undefined {
  const type = asString(payload.type);
  if (type === 'tool_approval_response') {
    const approvals = (
      Array.isArray(payload.approvals) ? payload.approvals : []
    ).map(asRecord);
    const rejected = approvals.find(
      approval => approval && approval.approved !== true,
    );
    return {
      kind: 'data',
      data: {
        decision_type: rejected ? 'reject' : 'approve',
        ...(asString(rejected?.rejection_reason) && {
          rejection_reason: rejected!.rejection_reason,
        }),
      },
    };
  }
  if (type === 'ask_user_response') {
    return {
      kind: 'data',
      data: {
        decision_type: 'approve',
        ask_user_answers: Array.isArray(payload.answers) ? payload.answers : [],
      },
    };
  }
  return undefined;
}

/**
 * One v1 message as a legacy-shaped message: `kind: 'message'`, the role as a
 * word, `kind`-discriminated parts — plus, when the message carries the HITL
 * extension, the synthesised parts that let the existing readers render the
 * request or resolve the decision.
 */
export function toWireMessage(raw: unknown): Wire | undefined {
  const parsed = a2aV1MessageWireSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const message = parsed.data;
  const parts = (Array.isArray(message.parts) ? message.parts : [])
    .map(toWirePart)
    .filter((part): part is Wire => Boolean(part));

  const hitl = readHitlPayload(message);
  if (hitl) {
    const role = normalizeA2aRole(message.role);
    if (role === 'user') {
      const decision = hitlResponsePart(hitl);
      if (decision) {
        parts.push(decision);
      }
    } else {
      parts.push(...hitlRequestParts(hitl));
    }
  }

  return {
    kind: 'message',
    ...(message.messageId && { messageId: message.messageId }),
    ...(message.role && { role: normalizeA2aRole(message.role) }),
    parts,
    ...(message.metadata !== undefined && { metadata: message.metadata }),
    ...(message.taskId && { taskId: message.taskId }),
    ...(message.contextId && { contextId: message.contextId }),
    ...(message.extensions && { extensions: message.extensions }),
  };
}

/**
 * An artifact as an **agent message**.
 *
 * On the API v2 line the agent's output lands in `Task.artifacts` (one artifact
 * per response, carrying the ADK metadata — author, token usage — on the
 * artifact), while `Task.history` holds what the user sent. The readers walk
 * `history` for the agent's replies and never `artifacts`, so each artifact
 * becomes a history entry, keeping its id as the message id and its metadata
 * (which is where `{adk,kagent}_usage_metadata` lives).
 */
function artifactToWireMessage(
  raw: unknown,
  task: { id?: string; contextId?: string },
): Wire | undefined {
  const parsed = a2aV1ArtifactWireSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const artifact = parsed.data;
  return {
    kind: 'message',
    ...(artifact.artifactId && { messageId: artifact.artifactId }),
    role: 'agent',
    parts: (Array.isArray(artifact.parts) ? artifact.parts : [])
      .map(toWirePart)
      .filter((part): part is Wire => Boolean(part)),
    ...(artifact.metadata !== undefined && { metadata: artifact.metadata }),
    ...(task.id && { taskId: task.id }),
    ...(task.contextId && { contextId: task.contextId }),
  };
}

export function toWireArtifact(raw: unknown): Wire | undefined {
  const parsed = a2aV1ArtifactWireSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const artifact = parsed.data;
  return {
    ...(artifact.artifactId && { artifactId: artifact.artifactId }),
    ...(artifact.name && { name: artifact.name }),
    ...(artifact.description && { description: artifact.description }),
    parts: (Array.isArray(artifact.parts) ? artifact.parts : [])
      .map(toWirePart)
      .filter((part): part is Wire => Boolean(part)),
    ...(artifact.metadata !== undefined && { metadata: artifact.metadata }),
  };
}

function toWireStatus(raw: unknown): Wire | undefined {
  const parsed = a2aV1TaskStatusWireSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const status = parsed.data;
  const message =
    status.message === undefined ? undefined : toWireMessage(status.message);
  return {
    ...(status.state && { state: normalizeA2aState(status.state) }),
    ...(status.timestamp && { timestamp: status.timestamp }),
    ...(message && { message }),
  };
}

/**
 * The instant a history entry belongs at, from the timeline position kagent
 * stamps on messages and artifacts alike. Undefined when absent, in which case
 * the entry keeps its relative order.
 */
function timelinePosition(entry: Wire): number | undefined {
  const raw = asRecord(entry.metadata)?.[TIMELINE_POSITION_KEY];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * A v1 task as the legacy-shaped task every reader parses.
 *
 * `history` is the user's messages **and** the agent's artifacts merged into
 * one conversation, ordered by kagent's timeline position where both carry one
 * and by arrival otherwise (a stable sort, so entries without a position keep
 * their place relative to their neighbours). An artifact whose id also appears
 * in the history is not added twice. `artifacts` is kept too, translated, for
 * anything that wants the raw shape.
 */
export function toWireTask(raw: unknown): Wire | undefined {
  const parsed = a2aV1TaskWireSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const task = parsed.data;
  const ids = { id: task.id, contextId: task.contextId };

  const history = (Array.isArray(task.history) ? task.history : [])
    .map(toWireMessage)
    .filter((entry): entry is Wire => Boolean(entry));
  const seen = new Set(
    history.map(entry => entry.messageId).filter(Boolean) as string[],
  );
  for (const artifact of Array.isArray(task.artifacts) ? task.artifacts : []) {
    const entry = artifactToWireMessage(artifact, ids);
    if (!entry) {
      continue;
    }
    const id = entry.messageId as string | undefined;
    if (id && seen.has(id)) {
      continue;
    }
    if (id) {
      seen.add(id);
    }
    history.push(entry);
  }

  const positioned = history.map((entry, index) => ({
    entry,
    index,
    at: timelinePosition(entry),
  }));
  positioned.sort((a, b) => {
    if (a.at === undefined || b.at === undefined) {
      return a.index - b.index;
    }
    return a.at - b.at || a.index - b.index;
  });

  const status = toWireStatus(task.status);
  return {
    ...(task.id && { id: task.id }),
    ...(task.contextId && { contextId: task.contextId }),
    kind: 'task',
    ...(status && { status }),
    history: positioned.map(item => item.entry),
    artifacts: (Array.isArray(task.artifacts) ? task.artifacts : [])
      .map(toWireArtifact)
      .filter((artifact): artifact is Wire => Boolean(artifact)),
    ...(task.metadata !== undefined && { metadata: task.metadata }),
  };
}

/**
 * One v1 `StreamResponse` as a legacy `kind`-discriminated stream event — the
 * shape `a2aStreamEventWireSchema` reads. A status update gains the `final`
 * flag the reducer needs, derived from its state.
 */
export function toWireStreamEvent(raw: unknown): Wire | undefined {
  const parsed = a2aV1StreamResponseWireSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const response = parsed.data;

  if (response.task !== undefined) {
    return toWireTask(response.task);
  }
  if (response.message !== undefined) {
    return toWireMessage(response.message);
  }

  const statusUpdate = asRecord(response.statusUpdate);
  if (statusUpdate) {
    const status = toWireStatus(statusUpdate.status);
    const state = status?.state as string | undefined;
    return {
      kind: 'status-update',
      ...(asString(statusUpdate.taskId) && { taskId: statusUpdate.taskId }),
      ...(asString(statusUpdate.contextId) && {
        contextId: statusUpdate.contextId,
      }),
      ...(status && { status }),
      final: state !== undefined && TERMINAL_STATES.has(state),
      ...(statusUpdate.metadata !== undefined && {
        metadata: statusUpdate.metadata,
      }),
    };
  }

  const artifactUpdate = asRecord(response.artifactUpdate);
  if (artifactUpdate) {
    const artifact =
      artifactUpdate.artifact === undefined
        ? undefined
        : toWireArtifact(artifactUpdate.artifact);
    return {
      kind: 'artifact-update',
      ...(asString(artifactUpdate.taskId) && { taskId: artifactUpdate.taskId }),
      ...(asString(artifactUpdate.contextId) && {
        contextId: artifactUpdate.contextId,
      }),
      ...(artifact && { artifact }),
      append: artifactUpdate.append === true,
      lastChunk: artifactUpdate.lastChunk === true,
      ...(artifactUpdate.metadata !== undefined && {
        metadata: artifactUpdate.metadata,
      }),
    };
  }

  return undefined;
}

/**
 * One relayed stream event in the shape the reducer reads, whichever wire it
 * came from: a v1 `StreamResponse` is translated, a legacy event passes
 * through untouched.
 */
export function normalizeStreamEvent(raw: unknown): unknown {
  return isA2aV1StreamResponse(raw) ? toWireStreamEvent(raw) : raw;
}
