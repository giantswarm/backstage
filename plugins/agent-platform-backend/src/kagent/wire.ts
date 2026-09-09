/**
 * kagent `main` (API v2) wire → the JSON shapes the rest of the Agent Platform
 * plugins already parse.
 *
 * kagent `main` speaks gRPC (`kagent.api.v1alpha1.*` for the control plane and
 * A2A v1 `lf.a2a.v1.A2AService` for turns); the frontend and the session-state /
 * usage readers in this plugin parse the REST envelope (`{error, data, message}`)
 * and the legacy A2A v0 task JSON that kagent 0.10 answered with. Rather than
 * porting every zod schema, hook and reducer at once, this module renders the
 * proto messages into exactly those shapes, so the split stays what it always
 * was: backend = transport, frontend = schema.
 *
 * Everything here is a pure function of a proto message. Nothing reaches the
 * network, so it is unit-tested against hand-built messages.
 */
import { toJson, type JsonObject as ProtoJsonObject } from '@bufbuild/protobuf';
import {
  timestampDate,
  ValueSchema,
  type Timestamp,
  type Value,
} from '@bufbuild/protobuf/wkt';
import { encodeKagentAgentId } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  Role,
  TaskState,
  type Artifact,
  type Message,
  type Part,
  type StreamResponse,
  type Task,
  type TaskStatus,
} from './gen/a2a_pb';
import {
  AgentInstanceState,
  type AgentInstance,
} from './gen/kagent/api/v1alpha1/agent_instances_pb';
import type { AgentTemplate } from './gen/kagent/api/v1alpha1/agent_templates_pb';

/** A plain JSON object, as the frontend's permissive schemas read it. */
export type JsonObject = Record<string, unknown>;

/**
 * protobuf-es v2 already represents `google.protobuf.Struct` fields as plain
 * JSON objects, so "conversion" is only a matter of dropping an empty one.
 * `google.protobuf.Value`, by contrast, stays a message and is rendered here.
 */
function structToJson(
  struct: ProtoJsonObject | undefined,
): JsonObject | undefined {
  if (!struct || Object.keys(struct).length === 0) {
    return undefined;
  }
  return struct;
}

function valueToJson(value: Value | undefined): unknown {
  return value ? toJson(ValueSchema, value) : undefined;
}

function timestampToIso(timestamp: Timestamp | undefined): string | undefined {
  if (!timestamp) {
    return undefined;
  }
  return timestampDate(timestamp).toISOString();
}

/**
 * The `agent_id` encoding kagent 0.10 stored on a session — the frontend joins
 * sessions to agents on it (`buildAgentIndex`), so an AgentInstance has to carry
 * the same encoding of its template's namespace and name.
 */
export function agentIdOf(instance: AgentInstance): string | undefined {
  const template = instance.agentTemplate;
  if (!template?.name) {
    return undefined;
  }
  return encodeKagentAgentId(template.namespace, template.name);
}

/**
 * How the v0 wire spelt an AgentInstance state. Only informational — the
 * session list never keyed anything off it — but a reader deserves a word rather
 * than an enum number.
 */
const INSTANCE_STATE_NAMES: Record<AgentInstanceState, string> = {
  [AgentInstanceState.UNSPECIFIED]: 'unknown',
  [AgentInstanceState.CREATING]: 'creating',
  [AgentInstanceState.READY]: 'ready',
  [AgentInstanceState.SUSPENDED]: 'suspended',
  [AgentInstanceState.FAILED]: 'failed',
  [AgentInstanceState.DELETING]: 'deleting',
  [AgentInstanceState.DELETED]: 'deleted',
};

/**
 * An AgentInstance as a kagent 0.10 `Session` row.
 *
 * `source: 'user'` because every instance the portal lists was created by a
 * person (the readers filter out `source === 'agent'` rows, which were 0.10's
 * agent-to-agent sessions; kagent `main` has no such rows in this list). The
 * instance's own fields ride along under their proto names for anyone who wants
 * them — `kagentSessionWireSchema` is a `looseObject`.
 */
export function toSessionWire(instance: AgentInstance): JsonObject {
  const createdAt = timestampToIso(instance.createdAt);
  const updatedAt = timestampToIso(instance.updatedAt) ?? createdAt;
  return {
    id: instance.id,
    ...(instance.name && { name: instance.name }),
    user_id: instance.creator,
    ...(createdAt && { created_at: createdAt }),
    ...(updatedAt && { updated_at: updatedAt }),
    ...(agentIdOf(instance) && { agent_id: agentIdOf(instance) }),
    source: 'user',
    // kagent `main` additions, under their proto names.
    context_id: instance.contextId,
    state: INSTANCE_STATE_NAMES[instance.state] ?? 'unknown',
    ...(instance.harness && {
      harness: { namespace: instance.harness.namespace, name: instance.harness.name },
    }),
    ...(instance.agentTemplate && {
      agent_template: {
        namespace: instance.agentTemplate.namespace,
        name: instance.agentTemplate.name,
      },
    }),
    ...(instance.failure && {
      failure: { reason: instance.failure.reason, message: instance.failure.message },
    }),
  };
}

/** kagent 0.10's `{error, data, message}` envelope around a payload. */
export function envelope(data: unknown): JsonObject {
  return { error: false, data };
}

/**
 * The legacy v0 spelling of a task state. Same words `describeSessionState` in
 * the common plugin knows, so the badges, the rail and the pending-confirmation
 * derivation keep working without a change.
 */
const TASK_STATE_NAMES: Record<TaskState, string> = {
  [TaskState.UNSPECIFIED]: 'unknown',
  [TaskState.SUBMITTED]: 'submitted',
  [TaskState.WORKING]: 'working',
  [TaskState.COMPLETED]: 'completed',
  [TaskState.FAILED]: 'failed',
  [TaskState.CANCELED]: 'canceled',
  [TaskState.INPUT_REQUIRED]: 'input-required',
  [TaskState.REJECTED]: 'rejected',
  [TaskState.AUTH_REQUIRED]: 'auth-required',
};

export function taskStateName(state: TaskState): string {
  return TASK_STATE_NAMES[state] ?? 'unknown';
}

/** States after which no further event follows on a turn. */
const TERMINAL_STATES = new Set<TaskState>([
  TaskState.COMPLETED,
  TaskState.FAILED,
  TaskState.CANCELED,
  TaskState.REJECTED,
  TaskState.INPUT_REQUIRED,
  TaskState.AUTH_REQUIRED,
]);

function roleName(role: Role): string {
  return role === Role.USER ? 'user' : 'agent';
}

/**
 * One A2A v1 part as its v0 JSON. The v0 wire discriminated on `kind`; v1 uses a
 * oneof. `data` is a `google.protobuf.Value`, rendered to plain JSON so the
 * function-call / confirmation readers see the object they expect.
 */
export function toV0Part(part: Part): JsonObject {
  const metadata = structToJson(part.metadata);
  const base = metadata ? { metadata } : {};
  switch (part.content.case) {
    case 'text':
      return { kind: 'text', text: part.content.value, ...base };
    case 'data':
      return { kind: 'data', data: valueToJson(part.content.value), ...base };
    case 'url':
      return {
        kind: 'file',
        file: {
          uri: part.content.value,
          ...(part.mediaType && { mimeType: part.mediaType }),
          ...(part.filename && { name: part.filename }),
        },
        ...base,
      };
    case 'raw':
      return {
        kind: 'file',
        file: {
          bytes: Buffer.from(part.content.value).toString('base64'),
          ...(part.mediaType && { mimeType: part.mediaType }),
          ...(part.filename && { name: part.filename }),
        },
        ...base,
      };
    default:
      return { ...base };
  }
}

export function toV0Message(message: Message): JsonObject {
  const metadata = structToJson(message.metadata);
  return {
    kind: 'message',
    messageId: message.messageId,
    role: roleName(message.role),
    parts: message.parts.map(toV0Part),
    ...(metadata && { metadata }),
    ...(message.taskId && { taskId: message.taskId }),
    ...(message.contextId && { contextId: message.contextId }),
  };
}

/**
 * An artifact as an **agent message**.
 *
 * On kagent `main` the agent's output lands in `Task.artifacts` (one artifact per
 * response, carrying the ADK metadata — author, token usage — on the artifact),
 * while `Task.history` holds only what the user sent. The v0 wire put the agent's
 * replies into `history` as `role: agent` messages, and that is what the timeline
 * and the usage summariser walk; neither reads `artifacts`. So each artifact
 * becomes a history entry, keeping its id (as the message id) and its metadata
 * (which is where `adk_usage_metadata` lives).
 */
export function artifactToV0Message(
  artifact: Artifact,
  task: { id: string; contextId: string },
): JsonObject {
  const metadata = structToJson(artifact.metadata);
  return {
    kind: 'message',
    messageId: artifact.artifactId,
    role: 'agent',
    parts: artifact.parts.map(toV0Part),
    ...(metadata && { metadata }),
    taskId: task.id,
    contextId: task.contextId,
  };
}

export function toV0Artifact(artifact: Artifact): JsonObject {
  const metadata = structToJson(artifact.metadata);
  return {
    artifactId: artifact.artifactId,
    ...(artifact.name && { name: artifact.name }),
    ...(artifact.description && { description: artifact.description }),
    parts: artifact.parts.map(toV0Part),
    ...(metadata && { metadata }),
  };
}

function toV0Status(status: TaskStatus | undefined): JsonObject | undefined {
  if (!status) {
    return undefined;
  }
  const timestamp = timestampToIso(status.timestamp);
  return {
    state: taskStateName(status.state),
    ...(timestamp && { timestamp }),
    ...(status.message && { message: toV0Message(status.message) }),
  };
}

/**
 * The instant a history entry belongs at, from the `kagent.dev/timeline-position`
 * metadata kagent `main` stamps on messages and artifacts alike. Undefined when
 * absent, in which case the entry keeps its relative order.
 */
function timelinePosition(entry: JsonObject): number | undefined {
  const metadata = entry.metadata as JsonObject | undefined;
  const raw = metadata?.['kagent.dev/timeline-position'];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * A v1 Task as the v0 task JSON `a2aTaskWireSchema` parses.
 *
 * `history` is the user's messages **and** the agent's artifacts merged into one
 * conversation, ordered by kagent's timeline position where both carry one and
 * by arrival otherwise. `artifacts` is kept too, verbatim, for anything that
 * wants the raw shape.
 */
export function toV0Task(task: Task): JsonObject {
  const ids = { id: task.id, contextId: task.contextId };
  const entries = [
    ...task.history.map(toV0Message),
    ...task.artifacts.map(artifact => artifactToV0Message(artifact, ids)),
  ];
  // A stable sort: entries without a position stay where they are relative to
  // their neighbours (Array.prototype.sort is stable since ES2019).
  const positioned = entries.map((entry, index) => ({
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

  const metadata = structToJson(task.metadata);
  const status = toV0Status(task.status);
  return {
    id: task.id,
    contextId: task.contextId,
    kind: 'task',
    ...(status && { status }),
    history: positioned.map(item => item.entry),
    artifacts: task.artifacts.map(toV0Artifact),
    ...(metadata && { metadata }),
  };
}

/**
 * Oldest first, by status timestamp, which is the order the v0 `/tasks` endpoint
 * answered in and the order `findNewestStatefulTaskIndex` (newest = last) relies
 * on. Tasks without a timestamp keep their relative order at the front.
 */
export function sortTasksOldestFirst(tasks: Task[]): Task[] {
  return [...tasks]
    .map((task, index) => ({
      task,
      index,
      at: task.status?.timestamp
        ? timestampDate(task.status.timestamp).getTime()
        : undefined,
    }))
    .sort((a, b) => {
      if (a.at === undefined || b.at === undefined) {
        return a.index - b.index;
      }
      return a.at - b.at || a.index - b.index;
    })
    .map(item => item.task);
}

/**
 * One `SendStreamingMessage` response as a v0 `message/stream` event — the
 * `kind`-discriminated shape `a2aStreamEventWireSchema` reads.
 *
 * The v1 status update carries no `final` flag; the v0 consumer needs one to
 * know the turn is over, so it is derived from the state: every terminal state,
 * `input-required` included, ends the stream of events for this turn.
 */
export function toV0StreamEvent(response: StreamResponse): JsonObject | undefined {
  const payload = response.payload;
  switch (payload.case) {
    case 'task':
      return toV0Task(payload.value);
    case 'message':
      return toV0Message(payload.value);
    case 'statusUpdate': {
      const event = payload.value;
      const status = toV0Status(event.status);
      const metadata = structToJson(event.metadata);
      return {
        kind: 'status-update',
        taskId: event.taskId,
        contextId: event.contextId,
        ...(status && { status }),
        final: event.status ? TERMINAL_STATES.has(event.status.state) : false,
        ...(metadata && { metadata }),
      };
    }
    case 'artifactUpdate': {
      const event = payload.value;
      return {
        kind: 'artifact-update',
        taskId: event.taskId,
        contextId: event.contextId,
        ...(event.artifact && { artifact: toV0Artifact(event.artifact) }),
        append: event.append,
        lastChunk: event.lastChunk,
      };
    }
    default:
      return undefined;
  }
}

/**
 * An AgentTemplate's Kubernetes object, as the controller encodes it: the whole
 * CR — `status.harnesses[]` included — under `resource.value`.
 */
export function templateResource(template: AgentTemplate): JsonObject | undefined {
  return structToJson(template.resource?.value);
}

type HarnessStatus = {
  harness?: string;
  conditions?: Array<{ type?: string; status?: string }>;
};

/**
 * The harnesses that admit a template, readiest first: the ones whose `Ready`
 * condition is `True` lead, then the rest of `status.harnesses[]`, then anything
 * the controller lists in `admitting_harnesses` that carries no status yet.
 * Empty when nothing admits the template — a session cannot be started then.
 */
export function harnessesOf(template: AgentTemplate): {
  name: string;
  ready: boolean;
}[] {
  const resource = templateResource(template);
  const status = (resource?.status as { harnesses?: HarnessStatus[] } | undefined)
    ?.harnesses;
  const seen = new Map<string, boolean>();
  for (const entry of status ?? []) {
    if (!entry?.harness) {
      continue;
    }
    const ready =
      entry.conditions?.some(
        condition => condition?.type === 'Ready' && condition?.status === 'True',
      ) ?? false;
    seen.set(entry.harness, ready);
  }
  for (const name of template.admittingHarnesses) {
    if (!seen.has(name)) {
      seen.set(name, false);
    }
  }
  return [...seen.entries()]
    .map(([name, ready]) => ({ name, ready }))
    .sort((a, b) => Number(b.ready) - Number(a.ready));
}
