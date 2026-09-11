import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { ConflictError, InputError } from '@backstage/errors';
import { create, toJson, type JsonObject } from '@bufbuild/protobuf';
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Transport,
} from '@connectrpc/connect';
import {
  A2AService,
  ListTasksResponseSchema,
  Role,
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  StreamResponseSchema,
  TaskSchema,
  type Part,
  type StreamResponse,
  type Task,
} from './kagent/gen/a2a_pb';
import {
  AgentInstanceService,
  CreateAgentInstanceResponseSchema,
  DeleteAgentInstanceResponseSchema,
  GetAgentInstanceResponseSchema,
  ListAgentInstancesResponseSchema,
  UpdateAgentInstanceNameResponseSchema,
  type AgentInstance,
} from './kagent/gen/kagent/api/v1alpha1/agent_instances_pb';
import {
  AgentTemplateService,
  type AgentTemplate,
} from './kagent/gen/kagent/api/v1alpha1/agent_templates_pb';
import { SystemService } from './kagent/gen/kagent/api/v1alpha1/system_pb';
import {
  ErrorContext,
  isTransportFailure,
  isTurnPendingError,
  isUpstreamError,
  mapConnectError,
  turnPendingError,
} from './kagent/errors';
import {
  A2A_EXTENSIONS_HEADER,
  buildHitlResponse,
  HITL_EXTENSION_URI,
  readHitlRequest,
  type HitlAnswer,
} from './kagent/hitl';
import {
  createKagentTransport,
  deriveKagentApiBaseUrl,
  isAbsoluteHttpUrl,
  type KagentInstallationConfig,
} from './kagent/transport';

export {
  isTransportFailure,
  isTurnPendingError,
  TURN_PENDING_ERROR_NAME,
} from './kagent/errors';
export {
  deriveKagentApiBaseUrl,
  type KagentInstallationConfig,
} from './kagent/transport';

/**
 * Header the agent-platform frontend uses to forward the user's
 * per-installation Dex OIDC ID token, which this proxy sets as
 * `authorization: Bearer` toward kagent.
 *
 * Mirrors muster's `backstage-muster-authorization`: kept off `Authorization`
 * because that header carries the Backstage identity on the inbound leg.
 *
 * Must match KAGENT_AUTH_HEADER in plugins/agent-platform.
 */
export const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

/** Default per-request timeout toward a kagent controller. */
export const DEFAULT_KAGENT_TIMEOUT_MS = 10_000;

/**
 * How long to wait for an A2A turn before answering "still running".
 *
 * `SendMessage` answers only once the agent has finished, so this is not "how
 * long a turn may take" — it is how long we are willing to hold a response open
 * before reporting the turn as dispatched. **The turn survives us stopping**, so
 * waiting longer buys nothing except a held-open socket.
 *
 * **It must stay below the timeout of whatever fronts Backstage**, and that is the
 * whole reason it is short: at 30 s we always win the race against a 60 s door,
 * and a genuine immediate rejection still surfaces inline rather than as a pending
 * turn that never appears. Exceeding it is not a failure: see
 * {@link turnPendingError}.
 */
export const DEFAULT_KAGENT_TURN_TIMEOUT_MS = 30_000;

/**
 * Longest session name this proxy will store.
 *
 * The controller caps an AgentInstance name at 200 characters
 * (`CreateAgentInstanceRequest.name` / `UpdateAgentInstanceNameRequest.name`,
 * `max_len: 200`) and refuses control characters and surrounding whitespace.
 * Enforced here as well as in the dialog, because a client-side `maxLength` is a
 * nicety and not a guard. Reads stay unbounded: a longer name set by kagent's own
 * UI must still render.
 *
 * Must match SESSION_NAME_MAX_LENGTH in plugins/agent-platform.
 */
export const SESSION_NAME_MAX_LENGTH = 200;

/**
 * Longest message this proxy will forward to an agent.
 *
 * Ours, not kagent's — nothing upstream validates the text. Generous on purpose,
 * because pasting logs or a manifest into a prompt is a normal thing to do; it
 * exists to keep an absurd payload from becoming an agent's whole context window.
 *
 * Counts UTF-16 code units (JavaScript's `String.length`), so a character
 * outside the BMP costs two. The router raises its JSON body limit to keep this
 * the bound a caller actually meets, rather than the body parser's.
 *
 * Must match MESSAGE_TEXT_MAX_LENGTH in plugins/agent-platform.
 */
export const MESSAGE_TEXT_MAX_LENGTH = 32_000;

/**
 * Bounds of the controller's `request_id` (`CreateAgentInstanceRequest`,
 * `min_len: 1, max_len: 128`), which the browser supplies so a retried create
 * is idempotent. Checked here so a bad one is a 400 with our words rather than
 * an `InvalidArgument` with the controller's.
 */
export const REQUEST_ID_MAX_LENGTH = 128;

/** The gRPC metadata key that selects the AgentInstance an A2A call belongs to. */
export const AGENT_INSTANCE_HEADER = 'x-kagent-agent-instance-id';

/**
 * Page size for the paged listings. The controller caps `ListTasks` at 100 and
 * `ListAgentInstances` at 100; both are walked to the end below, so this only
 * sets how many round trips a long list costs.
 */
const PAGE_SIZE = 100;

/**
 * How many pages a listing is followed for before it is cut. A thousand turns
 * or two thousand instances is far beyond any conversation or account this
 * plugin renders; the bound exists so a misbehaving `next_page_token` cannot
 * loop forever.
 */
const MAX_TASK_PAGES = 10;
const MAX_INSTANCE_PAGES = 20;

/** Who a call is made as. */
export interface KagentRequestOptions {
  /**
   * The user's Dex ID token, forwarded as `authorization: Bearer` toward the
   * controller route. Optional because `GetCurrentUser` is useful even when no
   * token could be minted — it then reports what the route makes of a missing
   * one; everything touching an AgentInstance requires one.
   */
  userToken?: string;
}

/** What one `ListTasks` read asks the controller to shape each task like. */
export interface ListSessionTasksOptions {
  /**
   * The session-state summary reads many of these in one pass and gives each a
   * shorter leash than the client default, so one hung connection cannot spend
   * the whole pass's budget.
   */
  timeoutMs?: number;
  /**
   * How many history entries per task. Absent means all of them; `0` means none
   * — right for a caller that only reads `status`.
   */
  historyLength?: number;
  /**
   * Whether to include each task's artifacts — the agent's output on this line.
   * Defaults to true; the state summary turns it off.
   */
  includeArtifacts?: boolean;
}

/**
 * Resolve the installations this proxy can target, keyed by name.
 *
 * `agentPlatform.kagent.installations`, when present, acts as the allowlist and
 * each entry's `apiBaseUrl` overrides the derived origin. When absent, every
 * `gs.installations` entry with a `baseDomain` is derived — kagent is only
 * deployed on some installations, and the ones without it simply fail per
 * request and are reported as "not installed".
 *
 * Installations that resolve to no URL are logged once at init and omitted.
 */
export function readKagentInstallationsFromConfig(
  config: Config,
  logger: LoggerService,
): Map<string, KagentInstallationConfig> {
  const result = new Map<string, KagentInstallationConfig>();

  const gsInstallations = config.getOptionalConfig('gs.installations');
  const baseDomains = new Map<string, string | undefined>();
  for (const name of gsInstallations?.keys() ?? []) {
    baseDomains.set(
      name,
      gsInstallations?.getOptionalString(`${name}.baseDomain`),
    );
  }

  const overrides = config.getOptionalConfig(
    'agentPlatform.kagent.installations',
  );
  // The explicit block is the allowlist when present; otherwise fan out to the
  // whole configured fleet.
  const names = overrides ? overrides.keys() : [...baseDomains.keys()];

  for (const name of names) {
    const explicitUrl = overrides?.getOptionalString(`${name}.apiBaseUrl`);
    const apiBaseUrl =
      explicitUrl ?? deriveKagentApiBaseUrl(baseDomains.get(name));

    if (!apiBaseUrl) {
      logger.info(
        `Skipping kagent proxy for installation '${name}': no apiBaseUrl configured and no baseDomain to derive one from.`,
      );
      continue;
    }

    // Reject a non-absolute URL here rather than letting it fail per request:
    // an operator omitting the scheme would otherwise surface as an opaque
    // transport failure on every call instead of one clear message at startup.
    if (!isAbsoluteHttpUrl(apiBaseUrl)) {
      logger.warn(
        `Skipping kagent proxy for installation '${name}': apiBaseUrl must be an absolute http(s) URL.`,
        { apiBaseUrl },
      );
      continue;
    }

    result.set(name, {
      name,
      apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    });
  }

  return result;
}

/** A `Part` as `create(SendMessageRequestSchema, …)` accepts it. */
type PartInit = Pick<Part, 'content'>;

/** A message as {@link KagentClient.dispatch} sends it. */
type OutboundMessage = {
  messageId: string;
  parts: PartInit[];
  /** Set means "resume this task"; empty means "start a new one". */
  taskId?: string;
  extensions?: string[];
  metadata?: JsonObject;
};

/**
 * Client for one installation's kagent API v2 controller, over native gRPC.
 *
 * Speaks the control plane (`AgentInstanceService`, `AgentTemplateService`,
 * `SystemService`) and the A2A v1 service (`A2AService`), and answers with the
 * **proto3 JSON** of the controller's responses — `{agentInstances: […]}`,
 * `{tasks: […]}`, a `Task`, a `StreamResponse` per SSE frame. Nothing is
 * reshaped here: the split is the one it always was, backend = transport,
 * frontend = schema, and the schema tolerance for these shapes lives in
 * `agent-platform-common`.
 *
 * A "session" in the method names is an AgentInstance: one conversation of one
 * person with one AgentTemplate on one Harness (plan decision D10). Its id is
 * the instance id, and every A2A call names it in the
 * `x-kagent-agent-instance-id` metadata — exactly once; the gateway refuses a
 * missing or doubled header.
 *
 * **Identity is the bearer and nothing else.** Every call carries
 * `authorization: Bearer <the person's Dex ID token>`; agentgateway validates
 * it on the controller route and derives the caller from its `email` claim,
 * dropping any inbound identity header. This client therefore never sends one
 * — a test asserts it — because a header the gateway would drop is at best dead
 * weight and, against a controller reached without the gateway, impersonation.
 */
export class KagentClient {
  private readonly transport: Transport;
  private instances?: Client<typeof AgentInstanceService>;
  private templates?: Client<typeof AgentTemplateService>;
  private a2a?: Client<typeof A2AService>;
  private system?: Client<typeof SystemService>;

  constructor(
    private readonly installation: KagentInstallationConfig,
    private readonly logger: LoggerService,
    /** Overridable for tests (`createRouterTransport`); defaults to native gRPC toward `apiBaseUrl`. */
    transport?: Transport,
    private readonly timeoutMs: number = DEFAULT_KAGENT_TIMEOUT_MS,
    /** Separate budget for {@link sendMessage}, which waits out a whole turn. */
    private readonly turnTimeoutMs: number = DEFAULT_KAGENT_TURN_TIMEOUT_MS,
  ) {
    this.transport = transport ?? createKagentTransport(installation);
  }

  private get instanceService() {
    this.instances ??= createClient(AgentInstanceService, this.transport);
    return this.instances;
  }

  private get templateService() {
    this.templates ??= createClient(AgentTemplateService, this.transport);
    return this.templates;
  }

  private get a2aService() {
    this.a2a ??= createClient(A2AService, this.transport);
    return this.a2a;
  }

  private get systemService() {
    this.system ??= createClient(SystemService, this.transport);
    return this.system;
  }

  /**
   * `AgentInstanceService/ListAgentInstances` — the caller's instances, walked
   * to the end of the listing, as `{agentInstances: […]}`.
   *
   * **For the caller only, never `all_creators`.** The controller scopes the
   * list to the identity agentgateway derived from the bearer; the cross-user
   * flag needs a separate authorization this plugin has no business asking for.
   *
   * `agentTemplate` narrows the listing to one agent's instances server-side —
   * what an agent page's "Recent sessions" asks.
   */
  async listSessions(
    options: KagentRequestOptions,
    filter: { agentTemplate?: { namespace: string; name: string } } = {},
  ): Promise<unknown> {
    const context: ErrorContext = {
      endpoint: 'instance list',
      missingResource: `The kagent API for installation '${this.installation.name}' has no AgentInstances for this agent.`,
    };
    const instances: AgentInstance[] = [];
    let pageToken = '';
    for (let page = 0; page < MAX_INSTANCE_PAGES; page += 1) {
      // A per-iteration copy: the RPC closure must not capture the variable
      // the loop rewrites.
      const token = pageToken;
      const response = await this.call(
        () =>
          this.instanceService.listAgentInstances(
            {
              page: { limit: PAGE_SIZE, pageToken: token },
              ...(filter.agentTemplate && {
                agentTemplate: filter.agentTemplate,
              }),
            },
            this.callOptions(options),
          ),
        context,
      );
      instances.push(...response.agentInstances);
      pageToken = response.page?.nextPageToken ?? '';
      if (!pageToken) {
        break;
      }
    }
    return toJson(
      ListAgentInstancesResponseSchema,
      create(ListAgentInstancesResponseSchema, { agentInstances: instances }),
    );
  }

  /**
   * `AgentInstanceService/CreateAgentInstance` — start a conversation with one
   * agent: one AgentTemplate on one Harness.
   *
   * The Harness is the platform's: the one whose `Ready` condition the
   * template's `status.harnesses[]` reports `True`, read through
   * `AgentTemplateService/GetAgentTemplate` (which also lists the harnesses
   * that admit the template), so the backend depends on nothing the browser
   * read. A template no Harness admits cannot be instantiated; that is a stale
   * picker or a platform state, not a fault, so it is a 409 naming the agent.
   *
   * `requestId` is the browser's, one per submission and reused on a retry:
   * the controller keys idempotency on `(creator, request_id)` and answers the
   * existing instance for a repeat with the same parameters, `AlreadyExists`
   * (409) for a repeat with different ones.
   */
  async createSession(
    agent: { namespace: string; name: string },
    name: string,
    requestId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const agentRef = `${agent.namespace}/${agent.name}`;
    const harness = await this.pickHarness(agent, options);

    const response = await this.call(
      () =>
        this.instanceService.createAgentInstance(
          {
            harness: { namespace: agent.namespace, name: harness },
            agentTemplate: { namespace: agent.namespace, name: agent.name },
            requestId,
            name,
          },
          this.callOptions(options),
        ),
      {
        endpoint: 'instance create',
        missingResource: `Installation '${this.installation.name}' cannot start a session: kagent does not know the agent '${agentRef}' on harness '${harness}'.`,
        invalidArgument: reason =>
          new InputError(
            `kagent on installation '${this.installation.name}' did not accept the new session: ${reason}`,
          ),
      },
    );
    return toJson(CreateAgentInstanceResponseSchema, response);
  }

  /**
   * `AgentInstanceService/GetAgentInstance` — one session, as `{agentInstance}`.
   *
   * The controller scopes this by the caller, so a session belonging to
   * somebody else is indistinguishable from one that does not exist: both
   * answer `NotFound`. That is an expected outcome for a stale or shared deep
   * link, mapped to a 404 rather than a 5xx.
   */
  async getSession(
    sessionId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const response = await this.call(
      () =>
        this.instanceService.getAgentInstance(
          { agentInstanceId: sessionId },
          this.callOptions(options),
        ),
      {
        endpoint: 'instance detail',
        // The id is left out on purpose: it is opaque and high-cardinality, and
        // the user already has it in the URL they followed.
        missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
        invalidArgument: () =>
          new InputError('The session id is not an AgentInstance id.'),
      },
    );
    return toJson(GetAgentInstanceResponseSchema, response);
  }

  /**
   * `A2AService/ListTasks` for one instance — the conversation, its state and
   * per-message token usage — walked to the end, as `{tasks: […], totalSize}`.
   *
   * The instance is named by the `x-kagent-agent-instance-id` metadata; the
   * gateway scopes the listing to that instance, so no `context_id` needs
   * reading first (a `context_id` that does not match the instance's would
   * answer an empty list, not an error). Tasks come back oldest first.
   */
  async listSessionTasks(
    sessionId: string,
    options: KagentRequestOptions,
    extra: ListSessionTasksOptions = {},
  ): Promise<unknown> {
    const { tasks, totalSize } = await this.readTasks(
      sessionId,
      options,
      extra,
    );
    return toJson(
      ListTasksResponseSchema,
      create(ListTasksResponseSchema, { tasks, totalSize }),
    );
  }

  /** `A2AService/GetTask` for one turn of an instance, as a `Task`. */
  async getTask(
    sessionId: string,
    taskId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const task = await this.call(
      () =>
        this.a2aService.getTask(
          { id: taskId },
          {
            headers: this.turnHeaders(sessionId, options),
            timeoutMs: this.timeoutMs,
          },
        ),
      {
        endpoint: 'task detail',
        missingResource: `That turn does not exist on installation '${this.installation.name}'.`,
      },
    );
    return toJson(TaskSchema, task);
  }

  /**
   * Send one message to an instance's agent, as a turn of the conversation, and
   * wait for the turn — `A2AService/SendMessage` with the instance in metadata
   * and the HITL extension requested, answering the `SendMessageResponse` as
   * JSON (`{task}`; a bare `{message}` for an agent that answered without a
   * task).
   *
   * The agent's namespace and name are accepted for the route's sake, but the
   * instance already binds the template, so they are not sent anywhere.
   *
   * **It answers with the finished task**, not an acknowledgement, and a failed
   * turn is still a success at the transport: `status.state` carries the
   * outcome. Waiting a turn out is usually impossible — see the gateway note on
   * {@link DEFAULT_KAGENT_TURN_TIMEOUT_MS} — so a lost connection is verified
   * against the instance's tasks rather than reported as a failed message.
   */
  async sendMessage(
    sessionId: string,
    _agent: { namespace: string; name: string },
    message: { messageId: string; text: string },
    options: KagentRequestOptions,
  ): Promise<unknown> {
    return this.dispatch(
      sessionId,
      {
        messageId: message.messageId,
        parts: [{ content: { case: 'text', value: message.text } }],
      },
      options,
    );
  }

  /**
   * Send one message, **streaming** the turn's events as the agent produces
   * them.
   *
   * `A2AService/SendStreamingMessage` (server-streaming gRPC) with the instance
   * header and the HITL extension requested on every turn — a confirmation that
   * arrives on this turn is then a typed request the answer panel can render.
   * Each `StreamResponse` is relayed as one SSE `data:` frame carrying its JSON
   * (`{task}`, `{message}`, `{statusUpdate}`, `{artifactUpdate}`), so the router
   * relays bytes and the frontend interprets. The returned {@link Response} has
   * been opened (its first event awaited under the ordinary request timeout, as
   * the gateway answers a `task` snapshot the moment the turn is accepted) so a
   * rejection before the turn starts surfaces as an error here rather than as an
   * empty stream; the caller relays its body and owns its lifetime through
   * `signal`.
   *
   * A stream that dies mid-turn — a gateway's request timeout, an Envoy drain —
   * ends with one `{error}` frame and closes. The turn survives that as it
   * survives a cut `SendMessage`: losing this connection does not stop the
   * agent, and the conversation poll shows it finish.
   */
  async streamMessage(
    sessionId: string,
    _agent: { namespace: string; name: string },
    message: { messageId: string; text: string },
    options: KagentRequestOptions,
    /**
     * Aborts the upstream stream — wired by the router to the client connection,
     * so a browser that goes away stops the relay without stopping the turn.
     */
    signal: AbortSignal,
  ): Promise<Response> {
    const request = create(SendMessageRequestSchema, {
      message: {
        messageId: message.messageId,
        role: Role.USER,
        parts: [{ content: { case: 'text', value: message.text } }],
      },
    });
    const stream = this.a2aService
      .sendStreamingMessage(request, {
        headers: this.turnHeaders(sessionId, options),
        signal,
      })
      [Symbol.asyncIterator]();

    // The first event is awaited under the ordinary request timeout: a slow
    // start means kagent is unwell, not that the agent is thinking.
    let first: IteratorResult<StreamResponse>;
    try {
      first = await this.withTimeout(stream.next(), this.timeoutMs, signal);
    } catch (error) {
      if (signal.aborted) {
        // The caller hung up before kagent answered. Nothing to report to
        // anyone — rethrown for the router to swallow as a closed connection.
        throw error;
      }
      throw this.mapError(error, this.sendContext(true));
    }

    const encoder = new TextEncoder();
    const frame = (payload: unknown) =>
      encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
    const logger = this.logger;
    const installationName = this.installation.name;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let next = first;
          while (!next.done) {
            controller.enqueue(frame(toJson(StreamResponseSchema, next.value)));
            next = await stream.next();
          }
        } catch (error) {
          // The stream died mid-turn (a gateway's request timeout, an Envoy
          // drain, a runtime failure the gateway reports in-band). One error
          // frame says so; the turn keeps running regardless, and an
          // unterminated stream is the frontend's cue to fall back to the poll.
          const connectError = ConnectError.from(error);
          logger.debug(
            `A kagent event stream for installation '${installationName}' ended before the turn did`,
            { code: Code[connectError.code], error: connectError.rawMessage },
          );
          if (!signal.aborted) {
            controller.enqueue(
              frame({
                error: {
                  code: Code[connectError.code],
                  message: connectError.rawMessage,
                },
              }),
            );
          }
        } finally {
          controller.close();
        }
      },
      cancel() {
        void stream.return?.(undefined);
      },
    });

    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }

  /**
   * Answer the confirmation or question an agent is suspended on, resuming **the
   * same task**.
   *
   * A pending confirmation is not answerable with a plain message: a reply with
   * no `task_id` starts a new task and strands the suspended one. Naming the task
   * is what turns the reply into a resume. The decision travels as the HITL
   * extension's typed response in the message's metadata — built from **the
   * request the controller recorded** on the task (`GetTask`), never from
   * anything the browser claims about it, because the controller validates a
   * reply strictly (every requested tool decided exactly once, every question
   * answered, the correlation id echoed). The browser only says approve/reject
   * and the answers in the order asked; see `kagent/hitl.ts`.
   *
   * A text part carries the user's own words for the transcript — or, when
   * none were given, a plain rendering of the decision, so the message is never
   * empty.
   */
  async answerConfirmation(
    sessionId: string,
    _agent: { namespace: string; name: string },
    answer: HitlAnswer & {
      messageId: string;
      taskId: string;
      /** What to show in the transcript as the user's words. */
      text?: string;
    },
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const task = await this.call(
      () =>
        this.a2aService.getTask(
          { id: answer.taskId, historyLength: 0 },
          {
            headers: this.turnHeaders(sessionId, options),
            timeoutMs: this.timeoutMs,
          },
        ),
      {
        endpoint: 'task detail',
        missingResource: `The turn this answer belongs to does not exist on installation '${this.installation.name}'.`,
      },
    );
    const request = readHitlRequest(task);
    if (!request) {
      throw new ConflictError(
        `The agent on installation '${this.installation.name}' is not waiting for a decision on this turn; it may already have been answered.`,
      );
    }
    const payload = buildHitlResponse(request, answer);

    return this.dispatch(
      sessionId,
      {
        messageId: answer.messageId,
        parts: [
          {
            content: {
              case: 'text',
              value: answer.text ?? renderDecision(answer),
            },
          },
        ],
        taskId: answer.taskId,
        extensions: [HITL_EXTENSION_URI],
        metadata: { [HITL_EXTENSION_URI]: payload },
      },
      options,
    );
  }

  /**
   * `A2AService/CancelTask` — stop the turn server-side. The gateway cancels
   * the run at the harness and, when the runtime cannot, quiesces the actor and
   * records the task canceled itself; either way the returned `Task` carries
   * the terminal state. Canceling a turn that already ended answers the task as
   * it is — not an error, and nothing to undo.
   */
  async cancelTask(
    sessionId: string,
    taskId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const task = await this.call(
      () =>
        this.a2aService.cancelTask(
          { id: taskId },
          {
            headers: this.turnHeaders(sessionId, options),
            // Cancelling waits for the ingester to drain and the actor to
            // quiesce; give it the turn's budget rather than a read's.
            timeoutMs: this.turnTimeoutMs,
          },
        ),
      {
        endpoint: 'task cancel',
        missingResource: `That turn does not exist on installation '${this.installation.name}'.`,
        invalidArgument: reason =>
          new InputError(
            `kagent on installation '${this.installation.name}' did not accept the cancel: ${reason}`,
          ),
      },
    );
    return toJson(TaskSchema, task);
  }

  /**
   * `AgentInstanceService/DeleteAgentInstance` — scoped to the caller, like the
   * reads. The controller answers the instance as it moves to `DELETING`, passed
   * through as `{agentInstance}`.
   */
  async deleteSession(
    sessionId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const response = await this.call(
      () =>
        this.instanceService.deleteAgentInstance(
          { agentInstanceId: sessionId },
          this.callOptions(options),
        ),
      {
        endpoint: 'instance delete',
        missingResource: `That session does not exist on installation '${this.installation.name}'.`,
        invalidArgument: () =>
          new InputError('The session id is not an AgentInstance id.'),
      },
    );
    return toJson(DeleteAgentInstanceResponseSchema, response);
  }

  /**
   * `AgentInstanceService/UpdateAgentInstanceName` — rename one session.
   *
   * The controller validates the name itself (200 characters, no control
   * characters, no leading or trailing whitespace); a rejected name is the
   * caller's mistake and answers 400.
   */
  async updateSessionName(
    sessionId: string,
    name: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const response = await this.call(
      () =>
        this.instanceService.updateAgentInstanceName(
          { agentInstanceId: sessionId, name },
          this.callOptions(options),
        ),
      {
        endpoint: 'instance rename',
        missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
        invalidArgument: reason =>
          new InputError(
            `kagent on installation '${this.installation.name}' rejected the session name: ${reason}`,
          ),
      },
    );
    return toJson(UpdateAgentInstanceNameResponseSchema, response);
  }

  /**
   * `SystemService/GetCurrentUser` — the claims the controller resolved for the
   * call, as a plain object: `{sub: <the email agentgateway set>}` on the line
   * as pinned, the token's full claims once the controller re-derives the
   * identity itself. Either way `sub` is the caller, which is what the
   * frontend's "is this list mine" probe keys on.
   */
  async getMe(options: KagentRequestOptions): Promise<unknown> {
    const response = await this.call(
      () => this.systemService.getCurrentUser({}, this.callOptions(options)),
      { endpoint: 'current user', missingResource: 'current user' },
    );
    return response.claims ?? {};
  }

  /**
   * Post one A2A message and report honestly on what became of it.
   *
   * Shared by {@link sendMessage} and {@link answerConfirmation} because the
   * hard part is identical for both and must not drift: a turn outliving its
   * transport.
   */
  private async dispatch(
    sessionId: string,
    message: OutboundMessage,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const request = create(SendMessageRequestSchema, {
      message: {
        messageId: message.messageId,
        role: Role.USER,
        parts: message.parts,
        // Set means "resume this task"; empty means "start a new one". Naming a
        // terminal task is rejected outright, so an ordinary message omits it.
        ...(message.taskId && { taskId: message.taskId }),
        ...(message.extensions && { extensions: message.extensions }),
        ...(message.metadata && { metadata: message.metadata }),
      },
    });

    let response;
    try {
      response = await this.call(
        () =>
          this.a2aService.sendMessage(request, {
            headers: this.turnHeaders(sessionId, options),
            timeoutMs: this.turnTimeoutMs,
          }),
        this.sendContext(false),
      );
    } catch (error) {
      // A lost connection is not a failed message. The gateway in front of the
      // controller cuts the request off long before an agent is done, and the
      // turn keeps running regardless. So the only honest way to report this is
      // to go and look: if the message reached the instance's tasks, it was
      // dispatched and the conversation poll will show it finish; if it did
      // not, the failure was real. A decision — a 401, a 403, a rejected
      // request, an unknown instance — is not verified.
      if (
        !isUpstreamError(error) &&
        !isTurnPendingError(error) &&
        !isTransportFailure(error)
      ) {
        throw error;
      }
      if (
        !(await this.hasMessageLanded(sessionId, message.messageId, options))
      ) {
        throw error;
      }
      this.logger.debug(
        `A kagent turn outlived its transport on installation '${this.installation.name}'; the message was dispatched and is still running`,
      );
      throw turnPendingError(
        `The agent on installation '${this.installation.name}' is still working on the message; the connection closed before it finished.`,
      );
    }

    return toJson(SendMessageResponseSchema, response);
  }

  /** How a send's failures read: the instance is gone, or busy, or refused it. */
  private sendContext(pending: boolean): ErrorContext {
    return {
      endpoint: 'agent messaging',
      missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
      timeoutIsPending: pending || undefined,
      invalidArgument: reason =>
        new InputError(
          `The agent on installation '${this.installation.name}' did not accept the message: ${reason}`,
        ),
      // One active task per instance: a second message during a turn is not a
      // queued reply but a competing one, and the gateway refuses it. A 409 the
      // composer already explains ("the agent is working").
      unsupportedOperation: reason =>
        new ConflictError(
          `The agent on installation '${this.installation.name}' is still working on the previous message: ${reason}`,
        ),
    };
  }

  /**
   * Whether a message we sent is in the instance's tasks.
   *
   * Only asked after the send's transport failed, so there has been ample time
   * for the gateway to have written it — and a read failure here answers
   * "cannot tell", which keeps the original error rather than inventing a
   * second one.
   */
  private async hasMessageLanded(
    sessionId: string,
    messageId: string,
    options: KagentRequestOptions,
  ): Promise<boolean> {
    try {
      const { tasks } = await this.readTasks(sessionId, options, {
        includeArtifacts: false,
      });
      return tasks.some(task =>
        task.history.some(entry => entry.messageId === messageId),
      );
    } catch (error) {
      this.logger.debug(
        `Could not confirm whether a message reached installation '${this.installation.name}'`,
        { error: String(error) },
      );
      return false;
    }
  }

  private async readTasks(
    sessionId: string,
    options: KagentRequestOptions,
    extra: ListSessionTasksOptions,
  ): Promise<{ tasks: Task[]; totalSize: number }> {
    const context: ErrorContext = {
      endpoint: 'task list',
      missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
    };
    const tasks: Task[] = [];
    let totalSize = 0;
    let pageToken = '';
    for (let page = 0; page < MAX_TASK_PAGES; page += 1) {
      // A per-iteration copy, as in `listSessions`.
      const token = pageToken;
      const response = await this.call(
        () =>
          this.a2aService.listTasks(
            {
              pageSize: PAGE_SIZE,
              pageToken: token,
              includeArtifacts: extra.includeArtifacts ?? true,
              ...(extra.historyLength !== undefined && {
                historyLength: extra.historyLength,
              }),
            },
            {
              headers: this.turnHeaders(sessionId, options),
              timeoutMs: extra.timeoutMs ?? this.timeoutMs,
            },
          ),
        context,
      );
      tasks.push(...response.tasks);
      totalSize = response.totalSize;
      pageToken = response.nextPageToken;
      if (!pageToken) {
        break;
      }
    }
    return { tasks, totalSize: Math.max(totalSize, tasks.length) };
  }

  /**
   * The Harness a new instance of this template runs on: the first one whose
   * `Ready` condition on the template is `True`, else the first that admits the
   * template at all. None is a 409 — the template exists but nothing can run
   * it, which is a platform state the user cannot fix from a session composer.
   */
  private async pickHarness(
    agent: { namespace: string; name: string },
    options: KagentRequestOptions,
  ): Promise<string> {
    const response = await this.call(
      () =>
        this.templateService.getAgentTemplate(
          { ref: { namespace: agent.namespace, name: agent.name } },
          this.callOptions(options),
        ),
      {
        endpoint: 'template detail',
        missingResource: `Installation '${this.installation.name}' cannot start a session: kagent does not know the agent '${agent.namespace}/${agent.name}'.`,
      },
    );
    const template = response.agentTemplate;
    const harnesses = template ? harnessesOf(template) : [];
    const pick = harnesses[0];
    if (!pick) {
      throw new ConflictError(
        `No Harness admits the agent '${agent.namespace}/${agent.name}' on installation '${this.installation.name}', so no session can be started for it.`,
      );
    }
    if (!pick.ready) {
      this.logger.debug(
        `No Harness reports the agent '${agent.namespace}/${agent.name}' Ready on installation '${this.installation.name}'; starting on '${pick.name}' anyway`,
      );
    }
    return pick.name;
  }

  /**
   * The metadata of a control-plane call: the bearer, and nothing else that
   * identifies anyone — see the class note.
   */
  private callOptions(options: KagentRequestOptions) {
    return {
      headers: bearerHeaders(options),
      timeoutMs: this.timeoutMs,
    };
  }

  /**
   * The metadata of an A2A call: the bearer, the instance the call belongs to
   * (exactly once), and the HITL extension requested so a confirmation on this
   * turn arrives typed.
   */
  private turnHeaders(
    sessionId: string,
    options: KagentRequestOptions,
  ): Record<string, string> {
    return {
      ...bearerHeaders(options),
      [AGENT_INSTANCE_HEADER]: sessionId,
      [A2A_EXTENSIONS_HEADER]: HITL_EXTENSION_URI,
    };
  }

  /** Run one RPC and translate its failure into the error the caller should see. */
  private async call<T>(
    rpc: () => Promise<T>,
    context: ErrorContext,
  ): Promise<T> {
    try {
      return await rpc();
    } catch (error) {
      throw this.mapError(error, context);
    }
  }

  private mapError(error: unknown, context: ErrorContext): Error {
    return mapConnectError(
      error,
      context,
      this.installation.name,
      this.logger,
      this.turnTimeoutMs,
    );
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new ConnectError('first event timed out', Code.DeadlineExceeded),
        );
      }, timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new ConnectError('aborted', Code.Canceled));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        value => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }
}

/**
 * The transcript's rendering of a decision the user gave no words for: the
 * answers as given, else the verdict — so the reply message is never empty.
 */
function renderDecision(answer: HitlAnswer): string {
  if (answer.answers && answer.answers.length > 0) {
    return answer.answers.map(values => values.join(', ')).join('\n');
  }
  return answer.decision === 'approve' ? 'Approved.' : 'Rejected.';
}

/**
 * `authorization: Bearer <token>` when a token is known, else nothing. The one
 * place identity is put on the wire, so that "no identity header, ever" is a
 * property of one function rather than of every call site.
 */
function bearerHeaders(options: KagentRequestOptions): Record<string, string> {
  return options.userToken
    ? { authorization: `Bearer ${options.userToken}` }
    : {};
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
 *
 * Read off the template's Kubernetes object, which the controller returns whole
 * (`status.harnesses[]` included) under `resource.value`.
 */
export function harnessesOf(template: AgentTemplate): {
  name: string;
  ready: boolean;
}[] {
  const resource = template.resource?.value as
    { status?: { harnesses?: HarnessStatus[] } } | undefined;
  const seen = new Map<string, boolean>();
  for (const entry of resource?.status?.harnesses ?? []) {
    if (!entry?.harness) {
      continue;
    }
    const ready =
      entry.conditions?.some(
        condition =>
          condition?.type === 'Ready' && condition?.status === 'True',
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
