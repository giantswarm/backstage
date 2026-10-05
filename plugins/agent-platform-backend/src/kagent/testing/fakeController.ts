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
  RuntimeOperation,
  RuntimeState,
} from '../gen/kagent/api/v1alpha1/runtime_pb';
import {
  SessionSchema,
  SessionService,
  type CreateSessionRequest,
  type ListSessionsRequest,
  type Session,
} from '../gen/kagent/api/v1alpha1/sessions_pb';
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
 * `SessionService` (create/get/list/rename/delete), `SystemService` (current
 * user/version) and the A2A v1 `A2AService` (send/stream/list/get/cancel). Everything else
 * answers `Unimplemented`, as a Connect router does for a method the
 * implementation leaves out.
 *
 * What it models, because the client is built against it:
 *
 * - **Identity is the bearer.** A call without `authorization` is refused
 *   `Unauthenticated`, as the gateway refuses it; the token maps to an email,
 *   which is the creator every session is scoped by. There is no identity
 *   header to send — one that arrives is recorded so a test can assert it was
 *   never sent.
 * - **Idempotent create** on `(creator, request_id)`: a repeat with the same
 *   Agent answers the existing session, a repeat with other parameters
 *   `AlreadyExists`. An Agent the controller knows no ready revision for is
 *   `FailedPrecondition`, as the controller answers it.
 * - **A2A routing** as the gateway does it: the Agent from the request's
 *   `tenant` (`<namespace>/<name>`, refused otherwise), the session from
 *   `message.contextId` or the task named; a send with neither starts a new
 *   session of that Agent; a context that does not match the task is
 *   `InvalidArgument`; somebody else's session, or another Agent's, is
 *   `NotFound`. No metadata routes anything. A session not `READY` with no
 *   operation in flight refuses work.
 * - **HITL is negotiated**: a turn scripted to pause carries the typed request
 *   on the paused task only when the call requested the extension.
 * - **One active task per session**: a second message during a turn is the
 *   gateway's *unsupported operation* refusal.
 * - **Cancel** ends a long turn server-side and records the task canceled.
 *
 * Turns are scripted per test through {@link FakeControllerOptions.turn}; the
 * default is a two-chunk streamed reply, in the shape the Go ADK streams
 * (artifact updates marked append/lastChunk, then a terminal status update).
 */

export type RecordedCall = {
  service: string;
  method: string;
  /** Every request header, lower-cased names, as the server received them. */
  headers: Record<string, string>;
  /** The A2A request's `tenant`, when the call carried one. */
  tenant?: string;
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
  /** The Agents the controller knows, and whether each has a ready revision. */
  agents?: { namespace: string; name: string; ready: boolean }[];
  /** How the agent answers a fresh message. Defaults to a short reply. */
  turn?: (input: {
    session: Session;
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
  /** Sessions by id, as the controller holds them. */
  sessions: Map<string, Session>;
  /** Tasks by session id, oldest first. */
  tasks: Map<string, StoredTask[]>;
};

const DEFAULT_USERS = {
  'user-token': 'dev@lab.local',
  'other-token': 'other@lab.local',
};

const TIMELINE_POSITION_KEY = 'kagent.dev/a2a/timeline-position';
const USAGE_KEY = 'kagent.dev/a2a/usage';
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
  const agents = new Map<string, boolean>();
  for (const seed of options.agents ?? []) {
    agents.set(`${seed.namespace}/${seed.name}`, seed.ready);
  }
  const turnScript =
    options.turn ??
    ((): TurnScript => ({ kind: 'reply', text: 'Hello from the fake agent.' }));

  const calls: RecordedCall[] = [];
  const sessions = new Map<string, Session>();
  /** Session id by task id, the gateway's way from a task to its session. */
  const taskSessions = new Map<string, string>();
  const creators = new Map<string, string>();
  const requests = new Map<string, string>();
  const tasks = new Map<string, StoredTask[]>();

  function record(
    service: string,
    method: string,
    ctx: HandlerContext,
    tenant?: string,
  ) {
    const headers: Record<string, string> = {};
    ctx.requestHeader.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    calls.push({ service, method, headers, ...(tenant && { tenant }) });
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

  /** The Agent an A2A request names, as the gateway parses the `tenant`. */
  function agentOf(tenant: string): { namespace: string; name: string } {
    const [namespace, name, ...rest] = tenant.split('/');
    if (!namespace || !name || rest.length > 0) {
      throw new ConnectError(
        'Agent tenant must be namespace/name',
        Code.InvalidArgument,
      );
    }
    return { namespace, name };
  }

  function sameAgent(
    session: Session,
    agent: { namespace: string; name: string },
  ): boolean {
    return (
      session.agent?.namespace === agent.namespace &&
      session.agent?.name === agent.name
    );
  }

  /** The session a task belongs to, for the caller and the Agent named. */
  function taskSession(
    ctx: HandlerContext,
    tenant: string,
    taskId: string,
  ): Session {
    const creator = creatorOf(ctx);
    const agent = agentOf(tenant);
    const sessionId = taskSessions.get(taskId);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (
      !session ||
      creators.get(session.id) !== creator ||
      !sameAgent(session, agent)
    ) {
      throw new ConnectError('task not found', Code.NotFound);
    }
    return session;
  }

  /** The session a context names, for the caller and the Agent named. */
  function contextSession(
    ctx: HandlerContext,
    tenant: string,
    contextId: string,
  ): Session {
    const creator = creatorOf(ctx);
    const agent = agentOf(tenant);
    const session = sessions.get(contextId);
    if (
      !session ||
      creators.get(session.id) !== creator ||
      !sameAgent(session, agent)
    ) {
      throw new ConnectError('Session not found', Code.NotFound);
    }
    return session;
  }

  /**
   * The session a send is for: the task's when the message names one, the
   * context's when it names one, else a new session of the Agent — exactly
   * the gateway's resolution. A context that does not match the task is
   * refused, and so is a session that cannot take work.
   */
  function sendSession(
    ctx: HandlerContext,
    tenant: string,
    message: Message,
  ): Session {
    let session: Session;
    if (message.taskId) {
      session = taskSession(ctx, tenant, message.taskId);
    } else if (message.contextId) {
      session = contextSession(ctx, tenant, message.contextId);
    } else {
      const agent = agentOf(tenant);
      session = createSession(ctx, {
        agent,
        requestId: `a2a/${tenant}/${message.messageId}`,
        name: '',
      } as CreateSessionRequest);
    }
    if (message.contextId && message.contextId !== session.contextId) {
      throw new ConnectError(
        'message context does not match task',
        Code.InvalidArgument,
      );
    }
    if (
      session.state !== RuntimeState.READY ||
      session.operation !== RuntimeOperation.NONE
    ) {
      throw new ConnectError(
        'Session cannot accept work during a lifecycle operation',
        Code.Unimplemented,
      );
    }
    return session;
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

  function owned(ctx: HandlerContext, id: string): Session {
    const creator = creatorOf(ctx);
    const session = sessions.get(id);
    if (!session || creators.get(id) !== creator) {
      throw new ConnectError('Session not found', Code.NotFound);
    }
    return session;
  }

  function validName(name: string) {
    if (name.length > 200 || /^\s|\s$|[\p{Cc}]/u.test(name)) {
      throw new ConnectError(
        'name must be at most 200 characters without control characters or surrounding whitespace',
        Code.InvalidArgument,
      );
    }
  }

  function createSession(
    ctx: HandlerContext,
    request: CreateSessionRequest,
  ): Session {
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
    if (!request.agent) {
      throw new ConnectError('agent is required', Code.InvalidArgument);
    }
    const key = `${creator}:${requestId}`;
    const existingId = requests.get(key);
    if (existingId) {
      const existing = sessions.get(existingId)!;
      const same =
        existing.agent?.name === request.agent.name &&
        existing.agent?.namespace === request.agent.namespace;
      if (!same) {
        throw new ConnectError(
          'request_id was already used for a different Session',
          Code.AlreadyExists,
        );
      }
      return existing;
    }
    if (!agents.get(`${request.agent.namespace}/${request.agent.name}`)) {
      throw new ConnectError(
        'Agent does not have a ready prepared revision',
        Code.FailedPrecondition,
      );
    }
    const at = timestampFromDate(now());
    const session = create(SessionSchema, {
      id: randomUUID(),
      creator,
      agent: request.agent,
      preparedRevision: 'rev-1',
      state: RuntimeState.READY,
      operation: RuntimeOperation.NONE,
      createdAt: at,
      updatedAt: at,
      name: request.name,
    });
    session.contextId = session.id;
    sessions.set(session.id, session);
    creators.set(session.id, creator);
    requests.set(key, session.id);
    tasks.set(session.id, []);
    return session;
  }

  function listSessions(ctx: HandlerContext, request: ListSessionsRequest) {
    const creator = creatorOf(ctx);
    if (request.allCreators) {
      throw new ConnectError(
        'not allowed to list all creators',
        Code.PermissionDenied,
      );
    }
    let mine = [...sessions.values()].filter(
      session => creators.get(session.id) === creator,
    );
    if (request.agent) {
      mine = mine.filter(
        session =>
          session.agent?.namespace === request.agent!.namespace &&
          session.agent?.name === request.agent!.name,
      );
    }
    const limit = request.page?.limit || 50;
    const offset = Number(request.page?.pageToken || '0');
    const slice = mine.slice(offset, offset + limit);
    const next = offset + limit < mine.length ? String(offset + limit) : '';
    return { sessions: slice, page: { nextPageToken: next } };
  }

  /** Bump `updatedAt` on the session, as the controller does on every turn. */
  function touch(session: Session) {
    const touched = clone(SessionSchema, session);
    touched.updatedAt = timestampFromDate(now());
    sessions.set(session.id, touched);
  }

  function storedTasks(session: Session): StoredTask[] {
    return tasks.get(session.id) ?? [];
  }

  function taskOf(session: Session, id: string): StoredTask {
    const stored = storedTasks(session).find(entry => entry.task.id === id);
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
    append: boolean,
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
          },
          append,
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
    session: Session,
    request: SendMessageRequest,
  ): AsyncGenerator<StreamResponse> {
    const message = request.message;
    if (!message || !message.messageId) {
      throw new ConnectError('message ID is required', Code.InvalidArgument);
    }
    const activated = hitlActivated(ctx);
    const list = storedTasks(session);

    // A reply to a paused task resumes it.
    if (message.taskId) {
      const stored = taskOf(session, message.taskId);
      if (stored.task.status?.state !== TaskState.INPUT_REQUIRED) {
        throw new ConnectError(
          'reply does not match the pending input request',
          Code.InvalidArgument,
        );
      }
      validateHitlResponse(stored.task, message);
      const user = clone(MessageSchema, message);
      user.contextId = session.contextId;
      user.role = Role.USER;
      user.metadata = { ...message.metadata, [TIMELINE_POSITION_KEY]: stamp() };
      const resumed = clone(TaskSchema, stored.task);
      // a2a-go appends the reply first, then moves the status message the next
      // status replaces into history, so the prompt lands after the reply and
      // only its timeline position puts it back in front.
      resumed.history.push(user);
      if (resumed.status?.message) {
        resumed.history.push(resumed.status.message);
      }
      resumed.artifacts.push(
        create(ArtifactSchema, {
          artifactId: `${stored.task.id}-resumed`,
          parts: [
            { content: { case: 'text', value: 'Done, after your decision.' } },
          ],
          metadata: {
            [USAGE_KEY]: {
              promptTokenCount: 10,
              candidatesTokenCount: 4,
            },
            [TIMELINE_POSITION_KEY]: stamp(),
          },
        }),
      );
      const completed = withStatus(resumed, TaskState.COMPLETED);
      stored.task = completed;
      touch(session);
      yield statusUpdate(withStatus(resumed, TaskState.WORKING));
      yield statusUpdate(completed);
      return;
    }

    if (list.some(entry => !terminal(entry.task) && !entry.cancelled)) {
      // The gateway's one-active-task-per-session refusal, as a2a-go reports an
      // unsupported operation over gRPC.
      throw new ConnectError(
        `Session ${session.id} already has an active task`,
        Code.Unimplemented,
      );
    }
    if (
      list.some(entry => entry.task.status?.state === TaskState.INPUT_REQUIRED)
    ) {
      throw new ConnectError(
        `Session ${session.id} already has an active task`,
        Code.Unimplemented,
      );
    }

    const user = clone(MessageSchema, message);
    user.contextId = session.contextId;
    user.taskId = randomUUID();
    user.role = Role.USER;
    user.metadata = { ...message.metadata, [TIMELINE_POSITION_KEY]: stamp() };
    let task = create(TaskSchema, {
      id: user.taskId,
      contextId: session.contextId,
      status: {
        state: TaskState.SUBMITTED,
        timestamp: timestampFromDate(now()),
      },
      history: [user],
    });
    const stored: StoredTask = { task };
    list.push(stored);
    tasks.set(session.id, list);
    taskSessions.set(task.id, session.id);
    touch(session);

    yield create(StreamResponseSchema, {
      payload: { case: 'task', value: task },
    });
    task = withStatus(task, TaskState.WORKING);
    stored.task = task;
    yield statusUpdate(task);

    const script = turnScript({
      session,
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
              [USAGE_KEY]: {
                promptTokenCount: 700,
                candidatesTokenCount: 11,
              },
              [TIMELINE_POSITION_KEY]: stamp(),
            },
          }),
        ];
        const finished = withStatus(withArtifact, TaskState.COMPLETED);
        stored.task = finished;
        touch(session);
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
          ...(activated && { extensions: [HITL_EXTENSION_URI] }),
          metadata: {
            [TIMELINE_POSITION_KEY]: stamp(),
            ...(activated && {
              [HITL_EXTENSION_URI]: script.request as unknown as JsonObject,
            }),
          },
        });
        const paused = withStatus(task, TaskState.INPUT_REQUIRED, prompt);
        stored.task = paused;
        touch(session);
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
        touch(session);
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
    router.service(SessionService, {
      createSession(request, ctx) {
        record('SessionService', 'CreateSession', ctx);
        return { session: createSession(ctx, request) };
      },
      getSession(request, ctx) {
        record('SessionService', 'GetSession', ctx);
        return { session: owned(ctx, request.sessionId) };
      },
      listSessions(request, ctx) {
        record('SessionService', 'ListSessions', ctx);
        return listSessions(ctx, request);
      },
      updateSessionName(request, ctx) {
        record('SessionService', 'UpdateSessionName', ctx);
        const session = owned(ctx, request.sessionId);
        validName(request.name);
        const renamed = clone(SessionSchema, session);
        renamed.name = request.name;
        renamed.updatedAt = timestampFromDate(now());
        sessions.set(session.id, renamed);
        return { session: renamed };
      },
      deleteSession(request, ctx) {
        record('SessionService', 'DeleteSession', ctx);
        const session = owned(ctx, request.sessionId);
        sessions.delete(session.id);
        creators.delete(session.id);
        for (const entry of tasks.get(session.id) ?? []) {
          taskSessions.delete(entry.task.id);
        }
        tasks.delete(session.id);
        const deleting = clone(SessionSchema, session);
        deleting.state = RuntimeState.DELETING;
        return { session: deleting };
      },
    });

    router.service(SystemService, {
      getCurrentUser(_request, ctx) {
        record('SystemService', 'GetCurrentUser', ctx);
        return { claims: { sub: creatorOf(ctx) } };
      },
      getVersion(_request, ctx) {
        record('SystemService', 'GetVersion', ctx);
        return { kagentVersion: 'fake', gitCommit: 'a8353a0a', buildDate: '' };
      },
    });

    router.service(A2AService, {
      async sendMessage(request, ctx) {
        record('A2AService', 'SendMessage', ctx, request.tenant);
        const message = request.message;
        if (!message || !message.messageId) {
          throw new ConnectError(
            'message ID is required',
            Code.InvalidArgument,
          );
        }
        const session = sendSession(ctx, request.tenant, message);
        let last: Task | undefined;
        for await (const event of runTurn(ctx, session, request)) {
          if (event.payload.case === 'task') {
            last = event.payload.value;
          }
        }
        const taskId = last?.id ?? message.taskId;
        const stored = taskId ? taskOf(session, taskId) : undefined;
        return {
          payload: stored
            ? { case: 'task', value: stored.task }
            : { case: 'message', value: message },
        };
      },
      async *sendStreamingMessage(request, ctx) {
        record('A2AService', 'SendStreamingMessage', ctx, request.tenant);
        const message = request.message;
        if (!message || !message.messageId) {
          throw new ConnectError(
            'message ID is required',
            Code.InvalidArgument,
          );
        }
        const session = sendSession(ctx, request.tenant, message);
        yield* runTurn(ctx, session, request);
      },
      listTasks(request, ctx) {
        record('A2AService', 'ListTasks', ctx, request.tenant);
        const pageSize = request.pageSize || 50;
        if (pageSize < 1 || pageSize > 100) {
          throw new ConnectError(
            'page size must be between 1 and 100',
            Code.InvalidArgument,
          );
        }
        const creator = creatorOf(ctx);
        const agent = agentOf(request.tenant);
        // The caller's sessions of the Agent, narrowed to one by context.
        const scope = request.contextId
          ? [contextSession(ctx, request.tenant, request.contextId)]
          : [...sessions.values()].filter(
              session =>
                creators.get(session.id) === creator &&
                sameAgent(session, agent),
            );
        const all = scope.flatMap(session =>
          storedTasks(session).map(entry => entry.task),
        );
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
        record('A2AService', 'GetTask', ctx, request.tenant);
        const session = taskSession(ctx, request.tenant, request.id);
        return shape(
          taskOf(session, request.id).task,
          request.historyLength,
          true,
        );
      },
      cancelTask(request, ctx) {
        record('A2AService', 'CancelTask', ctx, request.tenant);
        const session = taskSession(ctx, request.tenant, request.id);
        const stored = taskOf(session, request.id);
        if (terminal(stored.task)) {
          return stored.task;
        }
        stored.task = withStatus(stored.task, TaskState.CANCELED);
        stored.cancel?.();
        touch(session);
        return stored.task;
      },
    });
  };

  return { routes, calls, sessions, tasks };
}
