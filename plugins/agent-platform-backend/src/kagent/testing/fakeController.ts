import { clone, create, type JsonObject } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  Code,
  ConnectError,
  type ConnectRouter,
  type HandlerContext,
} from '@connectrpc/connect';
import { randomUUID } from 'crypto';
import {
  A2AService,
  ArtifactSchema,
  MessageSchema,
  Role,
  StreamResponseSchema,
  TaskSchema,
  TaskState,
  TaskStatusSchema,
  type Message,
  type SendMessageRequest,
  type StreamResponse,
  type Task,
} from '../gen/a2a_pb';
import {
  AgentInstanceSchema,
  AgentInstanceService,
  AgentInstanceState,
  type AgentInstance,
  type CreateAgentInstanceRequest,
  type ListAgentInstancesRequest,
} from '../gen/kagent/api/v1alpha1/agent_instances_pb';
import {
  AgentTemplateSchema,
  AgentTemplateService,
  type AgentTemplate,
} from '../gen/kagent/api/v1alpha1/agent_templates_pb';
import { SystemService } from '../gen/kagent/api/v1alpha1/system_pb';
import {
  A2A_EXTENSIONS_HEADER,
  HITL_EXTENSION_URI,
  HITL_TYPE_ASK_USER_REQUEST,
  HITL_TYPE_ASK_USER_RESPONSE,
  HITL_TYPE_TOOL_APPROVAL_REQUEST,
  HITL_TYPE_TOOL_APPROVAL_RESPONSE,
} from '../hitl';

/**
 * An in-process stand-in for the kagent API v2 controller behind
 * agentgateway's JWT policy, implementing exactly the RPCs the backend uses:
 * `AgentInstanceService` (create/get/list/rename/delete),
 * `AgentTemplateService` (get/list), `SystemService` (current user/version)
 * and the A2A v1 `A2AService` (send/stream/list/get/cancel). Everything else
 * answers `Unimplemented`, as a Connect router does for a method the
 * implementation leaves out.
 *
 * What it models, because the client is built against it:
 *
 * - **Identity is the bearer.** A call without `authorization` is refused
 *   `Unauthenticated`, as the gateway refuses it; the token maps to an email,
 *   which is the creator every instance is scoped by. There is no identity
 *   header to send — one that arrives is recorded so a test can assert it was
 *   never sent.
 * - **Idempotent create** on `(creator, request_id)`: a repeat with the same
 *   harness and template answers the existing instance, a repeat with other
 *   parameters `AlreadyExists`.
 * - **A2A routing** by exactly one `x-kagent-agent-instance-id`; a missing or
 *   doubled header is `InvalidArgument`, somebody else's instance `NotFound`.
 * - **HITL is negotiated**: a turn scripted to pause carries the typed request
 *   on the paused task only when the call requested the extension.
 * - **One active task per instance**: a second message during a turn is the
 *   gateway's *unsupported operation* refusal.
 * - **Cancel** ends a long turn server-side and records the task canceled.
 *
 * Turns are scripted per test through {@link FakeControllerOptions.turn}; the
 * default is a two-chunk streamed reply, in the shape the Go ADK streams
 * (artifact updates stamped partial/complete, then a terminal status update).
 */

export type RecordedCall = {
  service: string;
  method: string;
  /** Every request header, lower-cased names, as the server received them. */
  headers: Record<string, string>;
};

/** What a scripted turn does once the message is accepted. */
export type TurnScript =
  /** Streams `text` in chunks and completes. */
  | { kind: 'reply'; text: string }
  /** Pauses at `input-required` with a tool approval or a question. */
  | {
      kind: 'hitl';
      request:
        | {
            type: typeof HITL_TYPE_TOOL_APPROVAL_REQUEST;
            hint?: string;
            tools: {
              id: string;
              call_id: string;
              name: string;
              args: unknown;
            }[];
          }
        | {
            type: typeof HITL_TYPE_ASK_USER_REQUEST;
            id: string;
            questions: {
              question: string;
              choices?: string[];
              multiple?: boolean;
            }[];
          };
    }
  /** Works until cancelled. */
  | { kind: 'long' }
  /** Fails with `reason`. */
  | { kind: 'fail'; reason: string };

export type FakeControllerOptions = {
  /** Bearer token → the email the gateway would derive. */
  users?: Record<string, string>;
  /** The templates the controller knows, with the harnesses admitting each. */
  templates?: {
    namespace: string;
    name: string;
    harnesses: { name: string; ready: boolean }[];
  }[];
  /** How the agent answers a fresh message. Defaults to a short reply. */
  turn?: (input: {
    instance: AgentInstance;
    message: Message;
    hitlActivated: boolean;
  }) => TurnScript;
  now?: () => Date;
};

type StoredTask = {
  task: Task;
  /** Resolves when a long turn is cancelled. */
  cancelled?: Promise<void>;
  cancel?: () => void;
};

export type FakeController = {
  routes: (router: ConnectRouter) => void;
  calls: RecordedCall[];
  /** Instances by id, as the controller holds them. */
  instances: Map<string, AgentInstance>;
  /** Tasks by instance id, oldest first. */
  tasks: Map<string, StoredTask[]>;
};

const DEFAULT_USERS = {
  'user-token': 'dev@lab.local',
  'other-token': 'other@lab.local',
};

const TIMELINE_POSITION_KEY = 'kagent.dev/timeline-position';
const TERMINAL = new Set([
  TaskState.COMPLETED,
  TaskState.FAILED,
  TaskState.CANCELED,
  TaskState.REJECTED,
]);

function terminal(task: Task): boolean {
  return task.status !== undefined && TERMINAL.has(task.status.state);
}

export function createFakeController(
  options: FakeControllerOptions = {},
): FakeController {
  const users: Record<string, string> = options.users ?? DEFAULT_USERS;
  const now = options.now ?? (() => new Date());
  const templates = new Map<string, AgentTemplate>();
  for (const seed of options.templates ?? []) {
    templates.set(
      `${seed.namespace}/${seed.name}`,
      create(AgentTemplateSchema, {
        ref: { namespace: seed.namespace, name: seed.name },
        description: `Template ${seed.name}`,
        modelConfigRef: {
          namespace: seed.namespace,
          name: 'default-model-config',
        },
        admittingHarnesses: seed.harnesses.map(h => h.name),
        resource: {
          apiVersion: 'kagent.dev/v1alpha3',
          kind: 'AgentTemplate',
          value: {
            metadata: { name: seed.name, namespace: seed.namespace },
            status: {
              harnesses: seed.harnesses.map(h => ({
                harness: h.name,
                conditions: [
                  { type: 'Accepted', status: 'True' },
                  { type: 'Ready', status: h.ready ? 'True' : 'False' },
                ],
              })),
            },
          },
        },
      }),
    );
  }
  const turnScript =
    options.turn ??
    ((): TurnScript => ({ kind: 'reply', text: 'Hello from the fake agent.' }));

  const calls: RecordedCall[] = [];
  const instances = new Map<string, AgentInstance>();
  const creators = new Map<string, string>();
  const requests = new Map<string, string>();
  const tasks = new Map<string, StoredTask[]>();

  function record(service: string, method: string, ctx: HandlerContext) {
    const headers: Record<string, string> = {};
    ctx.requestHeader.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    calls.push({ service, method, headers });
  }

  function creatorOf(ctx: HandlerContext): string {
    const bearer = ctx.requestHeader.get('authorization');
    const token = bearer?.replace(/^Bearer\s+/i, '');
    const email = token ? users[token] : undefined;
    if (!email) {
      throw new ConnectError('token missing or invalid', Code.Unauthenticated);
    }
    return email;
  }

  function stamp(): string {
    return now().toISOString();
  }

  /** The instance an A2A call is routed to, scoped to the caller. */
  function routed(ctx: HandlerContext): AgentInstance {
    const creator = creatorOf(ctx);
    const header = ctx.requestHeader.get('x-kagent-agent-instance-id');
    if (!header || header.includes(',')) {
      throw new ConnectError(
        'exactly one x-kagent-agent-instance-id header is required',
        Code.InvalidArgument,
      );
    }
    const instance = instances.get(header);
    if (!instance || creators.get(instance.id) !== creator) {
      throw new ConnectError('AgentInstance not found', Code.NotFound);
    }
    return instance;
  }

  function hitlActivated(ctx: HandlerContext): boolean {
    const requested = ctx.requestHeader.get(A2A_EXTENSIONS_HEADER) ?? '';
    const active = requested
      .split(',')
      .map(value => value.trim())
      .includes(HITL_EXTENSION_URI);
    if (active) {
      ctx.responseHeader.set(A2A_EXTENSIONS_HEADER, HITL_EXTENSION_URI);
    }
    return active;
  }

  function owned(ctx: HandlerContext, id: string): AgentInstance {
    const creator = creatorOf(ctx);
    const instance = instances.get(id);
    if (!instance || creators.get(id) !== creator) {
      throw new ConnectError('AgentInstance not found', Code.NotFound);
    }
    return instance;
  }

  function validName(name: string) {
    if (name.length > 200 || /^\s|\s$|[\p{Cc}]/u.test(name)) {
      throw new ConnectError(
        'name must be at most 200 characters without control characters or surrounding whitespace',
        Code.InvalidArgument,
      );
    }
  }

  function createInstance(
    ctx: HandlerContext,
    request: CreateAgentInstanceRequest,
  ): AgentInstance {
    const creator = creatorOf(ctx);
    const requestId = request.requestId;
    if (
      !requestId ||
      requestId.trim() !== requestId ||
      requestId.length > 128
    ) {
      throw new ConnectError(
        'request_id must be 1-128 characters without surrounding whitespace',
        Code.InvalidArgument,
      );
    }
    validName(request.name);
    if (!request.harness || !request.agentTemplate) {
      throw new ConnectError(
        'harness and agent_template are required',
        Code.InvalidArgument,
      );
    }
    const key = `${creator}:${requestId}`;
    const existingId = requests.get(key);
    if (existingId) {
      const existing = instances.get(existingId)!;
      const same =
        existing.harness?.name === request.harness.name &&
        existing.harness?.namespace === request.harness.namespace &&
        existing.agentTemplate?.name === request.agentTemplate.name &&
        existing.agentTemplate?.namespace === request.agentTemplate.namespace;
      if (!same) {
        throw new ConnectError(
          'request_id was already used for a different AgentInstance',
          Code.AlreadyExists,
        );
      }
      return existing;
    }
    const template = templates.get(
      `${request.agentTemplate.namespace}/${request.agentTemplate.name}`,
    );
    if (
      !template ||
      !template.admittingHarnesses.includes(request.harness.name)
    ) {
      throw new ConnectError(
        'AgentTemplate and Harness do not have a ready prepared revision',
        Code.FailedPrecondition,
      );
    }
    const at = timestampFromDate(now());
    const instance = create(AgentInstanceSchema, {
      id: randomUUID(),
      creator,
      harness: request.harness,
      agentTemplate: request.agentTemplate,
      preparedRevision: 'rev-1',
      state: AgentInstanceState.READY,
      createdAt: at,
      updatedAt: at,
      name: request.name,
      contextId: randomUUID(),
    });
    instances.set(instance.id, instance);
    creators.set(instance.id, creator);
    requests.set(key, instance.id);
    tasks.set(instance.id, []);
    return instance;
  }

  function listInstances(
    ctx: HandlerContext,
    request: ListAgentInstancesRequest,
  ) {
    const creator = creatorOf(ctx);
    if (request.allCreators) {
      throw new ConnectError(
        'not allowed to list all creators',
        Code.PermissionDenied,
      );
    }
    let mine = [...instances.values()].filter(
      instance => creators.get(instance.id) === creator,
    );
    if (request.agentTemplate) {
      mine = mine.filter(
        instance =>
          instance.agentTemplate?.namespace ===
            request.agentTemplate!.namespace &&
          instance.agentTemplate?.name === request.agentTemplate!.name,
      );
    }
    const limit = request.page?.limit || 50;
    const offset = Number(request.page?.pageToken || '0');
    const slice = mine.slice(offset, offset + limit);
    const next = offset + limit < mine.length ? String(offset + limit) : '';
    return { agentInstances: slice, page: { nextPageToken: next } };
  }

  /** Bump `updatedAt` on the instance, as the controller does on every turn. */
  function touch(instance: AgentInstance) {
    const touched = clone(AgentInstanceSchema, instance);
    touched.updatedAt = timestampFromDate(now());
    instances.set(instance.id, touched);
  }

  function storedTasks(instance: AgentInstance): StoredTask[] {
    return tasks.get(instance.id) ?? [];
  }

  function taskOf(instance: AgentInstance, id: string): StoredTask {
    const stored = storedTasks(instance).find(entry => entry.task.id === id);
    if (!stored) {
      throw new ConnectError('task not found', Code.NotFound);
    }
    return stored;
  }

  function withStatus(task: Task, state: TaskState, message?: Message): Task {
    const copy = clone(TaskSchema, task);
    copy.status = create(TaskStatusSchema, {
      state,
      timestamp: timestampFromDate(now()),
      ...(message && { message }),
    });
    return copy;
  }

  function statusUpdate(task: Task): StreamResponse {
    return create(StreamResponseSchema, {
      payload: {
        case: 'statusUpdate',
        value: {
          taskId: task.id,
          contextId: task.contextId,
          status: task.status,
        },
      },
    });
  }

  function artifactUpdate(
    task: Task,
    artifactId: string,
    text: string,
    partial: boolean,
    lastChunk: boolean,
  ): StreamResponse {
    return create(StreamResponseSchema, {
      payload: {
        case: 'artifactUpdate',
        value: {
          taskId: task.id,
          contextId: task.contextId,
          artifact: {
            artifactId,
            parts: [{ content: { case: 'text', value: text } }],
            metadata: {
              kagent_partial: partial,
              kagent_author: task.contextId,
            },
          },
          append: partial,
          lastChunk,
        },
      },
    });
  }

  /**
   * Run one turn: accept the message, script the agent, persist the task as it
   * goes, and yield the events a streaming caller sees.
   */
  async function* runTurn(
    ctx: HandlerContext,
    instance: AgentInstance,
    request: SendMessageRequest,
  ): AsyncGenerator<StreamResponse> {
    const message = request.message;
    if (!message || !message.messageId) {
      throw new ConnectError('message ID is required', Code.InvalidArgument);
    }
    if (message.contextId && message.contextId !== instance.contextId) {
      throw new ConnectError(
        'message context does not match AgentInstance',
        Code.InvalidArgument,
      );
    }
    const activated = hitlActivated(ctx);
    const list = storedTasks(instance);

    // A reply to a paused task resumes it.
    if (message.taskId) {
      const stored = taskOf(instance, message.taskId);
      if (stored.task.status?.state !== TaskState.INPUT_REQUIRED) {
        throw new ConnectError(
          'reply does not match the pending input request',
          Code.InvalidArgument,
        );
      }
      validateHitlResponse(stored.task, message);
      const user = clone(MessageSchema, message);
      user.contextId = instance.contextId;
      user.role = Role.USER;
      user.metadata = { ...message.metadata, [TIMELINE_POSITION_KEY]: stamp() };
      const resumed = clone(TaskSchema, stored.task);
      resumed.history.push(user);
      resumed.artifacts.push(
        create(ArtifactSchema, {
          artifactId: `${stored.task.id}-resumed`,
          parts: [
            { content: { case: 'text', value: 'Done, after your decision.' } },
          ],
          metadata: {
            kagent_usage_metadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 4,
            },
            [TIMELINE_POSITION_KEY]: stamp(),
          },
        }),
      );
      const completed = withStatus(resumed, TaskState.COMPLETED);
      stored.task = completed;
      touch(instance);
      yield statusUpdate(withStatus(resumed, TaskState.WORKING));
      yield statusUpdate(completed);
      return;
    }

    if (list.some(entry => !terminal(entry.task) && !entry.cancelled)) {
      // The gateway's one-active-task-per-instance refusal, as a2a-go reports an
      // unsupported operation over gRPC.
      throw new ConnectError(
        `AgentInstance ${instance.id} already has an active task`,
        Code.Unimplemented,
      );
    }
    if (
      list.some(entry => entry.task.status?.state === TaskState.INPUT_REQUIRED)
    ) {
      throw new ConnectError(
        `AgentInstance ${instance.id} already has an active task`,
        Code.Unimplemented,
      );
    }

    const user = clone(MessageSchema, message);
    user.contextId = instance.contextId;
    user.taskId = randomUUID();
    user.role = Role.USER;
    user.metadata = { ...message.metadata, [TIMELINE_POSITION_KEY]: stamp() };
    let task = create(TaskSchema, {
      id: user.taskId,
      contextId: instance.contextId,
      status: {
        state: TaskState.SUBMITTED,
        timestamp: timestampFromDate(now()),
      },
      history: [user],
    });
    const stored: StoredTask = { task };
    list.push(stored);
    tasks.set(instance.id, list);
    touch(instance);

    yield create(StreamResponseSchema, {
      payload: { case: 'task', value: task },
    });
    task = withStatus(task, TaskState.WORKING);
    stored.task = task;
    yield statusUpdate(task);

    const script = turnScript({
      instance,
      message: user,
      hitlActivated: activated,
    });
    switch (script.kind) {
      case 'reply': {
        const artifactId = `${task.id}-artifact`;
        const half = Math.ceil(script.text.length / 2);
        yield artifactUpdate(
          task,
          artifactId,
          script.text.slice(0, half),
          true,
          false,
        );
        yield artifactUpdate(
          task,
          artifactId,
          script.text.slice(half),
          true,
          false,
        );
        yield artifactUpdate(task, artifactId, script.text, false, true);
        const withArtifact = clone(TaskSchema, task);
        withArtifact.artifacts = [
          create(ArtifactSchema, {
            artifactId,
            parts: [{ content: { case: 'text', value: script.text } }],
            metadata: {
              kagent_author: instance.agentTemplate?.name ?? '',
              kagent_usage_metadata: {
                promptTokenCount: 700,
                candidatesTokenCount: 11,
              },
              [TIMELINE_POSITION_KEY]: stamp(),
            },
          }),
        ];
        const finished = withStatus(withArtifact, TaskState.COMPLETED);
        stored.task = finished;
        touch(instance);
        yield statusUpdate(finished);
        return;
      }
      case 'hitl': {
        const hint =
          script.request.type === HITL_TYPE_TOOL_APPROVAL_REQUEST
            ? (script.request.hint ??
              'Human input is required before the agent can continue.')
            : script.request.questions.map(q => q.question).join(' ');
        const prompt = create(MessageSchema, {
          messageId: randomUUID(),
          taskId: task.id,
          contextId: task.contextId,
          role: Role.AGENT,
          parts: [{ content: { case: 'text', value: hint } }],
          ...(activated && {
            extensions: [HITL_EXTENSION_URI],
            metadata: {
              [HITL_EXTENSION_URI]: script.request as unknown as JsonObject,
            },
          }),
        });
        const paused = withStatus(task, TaskState.INPUT_REQUIRED, prompt);
        stored.task = paused;
        touch(instance);
        yield statusUpdate(paused);
        return;
      }
      case 'long': {
        let cancel!: () => void;
        stored.cancelled = new Promise<void>(resolve => {
          cancel = resolve;
        });
        stored.cancel = cancel;
        await Promise.race([
          stored.cancelled,
          new Promise<void>(resolve => {
            ctx.signal.addEventListener('abort', () => resolve(), {
              once: true,
            });
          }),
        ]);
        if (stored.task.status?.state === TaskState.CANCELED) {
          yield statusUpdate(stored.task);
        }
        return;
      }
      case 'fail': {
        const failed = withStatus(
          task,
          TaskState.FAILED,
          create(MessageSchema, {
            messageId: randomUUID(),
            taskId: task.id,
            contextId: task.contextId,
            role: Role.AGENT,
            parts: [{ content: { case: 'text', value: script.reason } }],
          }),
        );
        stored.task = failed;
        touch(instance);
        yield statusUpdate(failed);
        return;
      }
      default:
        return;
    }
  }

  /** The controller's strict validation of a HITL reply against the request. */
  function validateHitlResponse(task: Task, message: Message) {
    const request = task.status?.message?.metadata?.[HITL_EXTENSION_URI] as
      Record<string, unknown> | undefined;
    if (!request) {
      // A pause without a typed request (HITL not negotiated on that turn)
      // resumes on any reply, as a plain hint would.
      return;
    }
    if (!message.extensions.includes(HITL_EXTENSION_URI)) {
      throw new ConnectError(
        `reply must declare ${HITL_EXTENSION_URI}`,
        Code.InvalidArgument,
      );
    }
    const response = message.metadata?.[HITL_EXTENSION_URI] as
      Record<string, unknown> | undefined;
    if (!response) {
      throw new ConnectError(
        'HITL response payload is required',
        Code.InvalidArgument,
      );
    }
    if (request.type === HITL_TYPE_TOOL_APPROVAL_REQUEST) {
      if (response.type !== HITL_TYPE_TOOL_APPROVAL_RESPONSE) {
        throw new ConnectError(
          'tool approval response required',
          Code.InvalidArgument,
        );
      }
      const wanted = new Set(
        (request.tools as { id: string }[]).map(tool => tool.id),
      );
      const approvals = response.approvals as
        | { id: string; approved: boolean; rejection_reason?: string }[]
        | undefined;
      if (!approvals || approvals.length !== wanted.size) {
        throw new ConnectError(
          'tool approval response must decide every requested tool',
          Code.InvalidArgument,
        );
      }
      for (const approval of approvals) {
        if (!wanted.delete(approval.id)) {
          throw new ConnectError(
            `tool approval response contains unknown or duplicate ID ${approval.id}`,
            Code.InvalidArgument,
          );
        }
        if (approval.approved && approval.rejection_reason) {
          throw new ConnectError(
            'approved tool cannot have a rejection reason',
            Code.InvalidArgument,
          );
        }
      }
      return;
    }
    if (request.type === HITL_TYPE_ASK_USER_REQUEST) {
      if (
        response.type !== HITL_TYPE_ASK_USER_RESPONSE ||
        response.id !== request.id
      ) {
        throw new ConnectError(
          'ask-user response has invalid correlation',
          Code.InvalidArgument,
        );
      }
      const answers = response.answers as unknown[] | undefined;
      const questions = request.questions as unknown[];
      if (
        !answers ||
        answers.length === 0 ||
        answers.length !== questions.length
      ) {
        throw new ConnectError(
          'ask-user response must answer every question',
          Code.InvalidArgument,
        );
      }
    }
  }

  function shape(
    task: Task,
    historyLength: number | undefined,
    includeArtifacts: boolean,
  ): Task {
    const shaped = clone(TaskSchema, task);
    if (historyLength !== undefined) {
      shaped.history = shaped.history.slice(
        Math.max(0, shaped.history.length - historyLength),
      );
    }
    if (!includeArtifacts) {
      shaped.artifacts = [];
    }
    return shaped;
  }

  const routes = (router: ConnectRouter) => {
    router.service(AgentInstanceService, {
      createAgentInstance(request, ctx) {
        record('AgentInstanceService', 'CreateAgentInstance', ctx);
        return { agentInstance: createInstance(ctx, request) };
      },
      getAgentInstance(request, ctx) {
        record('AgentInstanceService', 'GetAgentInstance', ctx);
        return { agentInstance: owned(ctx, request.agentInstanceId) };
      },
      listAgentInstances(request, ctx) {
        record('AgentInstanceService', 'ListAgentInstances', ctx);
        return listInstances(ctx, request);
      },
      updateAgentInstanceName(request, ctx) {
        record('AgentInstanceService', 'UpdateAgentInstanceName', ctx);
        const instance = owned(ctx, request.agentInstanceId);
        validName(request.name);
        const renamed = clone(AgentInstanceSchema, instance);
        renamed.name = request.name;
        renamed.updatedAt = timestampFromDate(now());
        instances.set(instance.id, renamed);
        return { agentInstance: renamed };
      },
      deleteAgentInstance(request, ctx) {
        record('AgentInstanceService', 'DeleteAgentInstance', ctx);
        const instance = owned(ctx, request.agentInstanceId);
        instances.delete(instance.id);
        creators.delete(instance.id);
        tasks.delete(instance.id);
        const deleting = clone(AgentInstanceSchema, instance);
        deleting.state = AgentInstanceState.DELETING;
        return { agentInstance: deleting };
      },
    });

    router.service(AgentTemplateService, {
      getAgentTemplate(request, ctx) {
        record('AgentTemplateService', 'GetAgentTemplate', ctx);
        creatorOf(ctx);
        const template = templates.get(
          `${request.ref?.namespace}/${request.ref?.name}`,
        );
        if (!template) {
          throw new ConnectError('AgentTemplate not found', Code.NotFound);
        }
        return { agentTemplate: template };
      },
      listAgentTemplates(request, ctx) {
        record('AgentTemplateService', 'ListAgentTemplates', ctx);
        creatorOf(ctx);
        return {
          agentTemplates: [...templates.values()].filter(
            template =>
              !request.namespace ||
              template.ref?.namespace === request.namespace,
          ),
        };
      },
    });

    router.service(SystemService, {
      getCurrentUser(_request, ctx) {
        record('SystemService', 'GetCurrentUser', ctx);
        return { claims: { sub: creatorOf(ctx) } };
      },
      getVersion(_request, ctx) {
        record('SystemService', 'GetVersion', ctx);
        return { kagentVersion: 'fake', gitCommit: '0ac52403', buildDate: '' };
      },
    });

    router.service(A2AService, {
      async sendMessage(request, ctx) {
        record('A2AService', 'SendMessage', ctx);
        const instance = routed(ctx);
        let last: Task | undefined;
        for await (const event of runTurn(ctx, instance, request)) {
          if (event.payload.case === 'task') {
            last = event.payload.value;
          }
        }
        const taskId = last?.id ?? request.message?.taskId;
        const stored = taskId ? taskOf(instance, taskId) : undefined;
        return {
          payload: stored
            ? { case: 'task', value: stored.task }
            : { case: 'message', value: request.message! },
        };
      },
      async *sendStreamingMessage(request, ctx) {
        record('A2AService', 'SendStreamingMessage', ctx);
        const instance = routed(ctx);
        yield* runTurn(ctx, instance, request);
      },
      listTasks(request, ctx) {
        record('A2AService', 'ListTasks', ctx);
        const instance = routed(ctx);
        const pageSize = request.pageSize || 50;
        if (pageSize < 1 || pageSize > 100) {
          throw new ConnectError(
            'page size must be between 1 and 100',
            Code.InvalidArgument,
          );
        }
        if (request.contextId && request.contextId !== instance.contextId) {
          return { tasks: [], pageSize, nextPageToken: '', totalSize: 0 };
        }
        const all = storedTasks(instance).map(entry => entry.task);
        const offset = Number(request.pageToken || '0');
        const page = all.slice(offset, offset + pageSize);
        return {
          tasks: page.map(task =>
            shape(
              task,
              request.historyLength,
              request.includeArtifacts ?? false,
            ),
          ),
          nextPageToken:
            offset + pageSize < all.length ? String(offset + pageSize) : '',
          pageSize,
          totalSize: all.length,
        };
      },
      getTask(request, ctx) {
        record('A2AService', 'GetTask', ctx);
        const instance = routed(ctx);
        return shape(
          taskOf(instance, request.id).task,
          request.historyLength,
          true,
        );
      },
      cancelTask(request, ctx) {
        record('A2AService', 'CancelTask', ctx);
        const instance = routed(ctx);
        const stored = taskOf(instance, request.id);
        if (terminal(stored.task)) {
          return stored.task;
        }
        stored.task = withStatus(stored.task, TaskState.CANCELED);
        stored.cancel?.();
        touch(instance);
        return stored.task;
      },
    });
  };

  return { routes, calls, instances, tasks };
}
