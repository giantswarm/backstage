import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import { create, fromJson, type JsonValue } from '@bufbuild/protobuf';
import { ValueSchema } from '@bufbuild/protobuf/wkt';
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Transport,
} from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-node';
import { randomUUID } from 'crypto';
import {
  A2AService,
  Role,
  SendMessageRequestSchema,
  type Part,
  type Task,
} from './kagent/gen/a2a_pb';
import { AgentInstanceService } from './kagent/gen/kagent/api/v1alpha1/agent_instances_pb';
import {
  AgentTemplateService,
  type AgentTemplate,
} from './kagent/gen/kagent/api/v1alpha1/agent_templates_pb';
import { SystemService } from './kagent/gen/kagent/api/v1alpha1/system_pb';
import { identityHeaders, type KagentIdentity } from './kagent/identity';
import {
  envelope,
  harnessesOf,
  sortTasksOldestFirst,
  templateResource,
  toSessionWire,
  toV0StreamEvent,
  toV0Task,
  type JsonObject,
} from './kagent/wire';

/**
 * Header the agent-platform frontend uses to forward the user's
 * per-installation Dex OIDC ID token, which this proxy sets as
 * `Authorization: Bearer` toward kagent.
 *
 * Mirrors muster's `backstage-muster-authorization`: kept off `Authorization`
 * because that header carries the Backstage identity on the inbound leg.
 *
 * Must match KAGENT_AUTH_HEADER in plugins/agent-platform.
 */
export const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

/** Default per-request timeout toward a kagent API. */
export const DEFAULT_KAGENT_TIMEOUT_MS = 10_000;

/**
 * How long to wait for an A2A turn before answering "still running".
 *
 * `SendMessage` answers only once the agent has finished, so this is not "how
 * long a turn may take" — it is how long we are willing to hold a response open
 * before reporting the turn as dispatched. The turn survives us stopping, so
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
 * kagent `main` caps an AgentInstance name at 200 characters
 * (`UpdateAgentInstanceNameRequest.name`, `max_len: 200`); ours is the tighter
 * of that and the conversation titles in the ai-chat plugin. Enforced here as
 * well as in the dialog, because a client-side `maxLength` is a nicety and not a
 * guard. Reads stay unbounded: a longer name set by kagent's own UI must still
 * render.
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
 * How much of a task's history one read asks for. kagent stores the whole
 * conversation; the timeline renders all of it, so this only has to be larger
 * than any conversation a person would scroll.
 */
const TASK_HISTORY_LENGTH = 1_000;

/** One installation's kagent endpoint. */
export interface KagentInstallationConfig {
  /** Installation name, as in `gs.installations`. */
  name: string;
  /**
   * kagent controller base URL, no trailing slash — the gRPC-Web door, e.g.
   * `https://agentgateway.<baseDomain>/kagent`. The service paths
   * (`/kagent.api.v1alpha1.AgentInstanceService/…`, `/lf.a2a.v1.A2AService/…`)
   * are appended.
   */
  apiBaseUrl: string;
}

/**
 * Who a call is made as. Optional because `/version` is useful even when no
 * token could be minted; everything that touches an AgentInstance requires one.
 */
export type KagentRequestOptions = KagentIdentity;

/**
 * Per-endpoint wording for a "not found", so the message a user reads matches
 * what actually went wrong: a bookmarked link to a deleted session is not an
 * outage.
 */
interface NotFoundContext {
  /** What `NotFound` means when **kagent** answered it: the resource is gone. */
  missingResource: string;
  /** Short name of the RPC, used when kagent does not implement it. */
  endpoint: string;
}

/**
 * Derive the kagent controller base URL for an installation from its base
 * domain.
 *
 * The hostname pattern matches the `agent-platform-connectivity` chart's
 * `kagent.uiRoute.hostname` (`kagent.<codename>.<base>`), which is exactly
 * `kagent.<baseDomain>` — the same derivation `useAgentAvatarUrl` uses for
 * `avatars.<baseDomain>`. kagent `main` serves gRPC-Web at the controller's root,
 * so — unlike the 0.10 REST door — no `/api` suffix is appended. On the
 * agent-platform installations the agentgateway door
 * (`https://agentgateway.<baseDomain>/kagent`) is what the chart configures.
 *
 * Returns undefined when the installation has no `baseDomain`.
 */
export function deriveKagentApiBaseUrl(
  baseDomain: string | undefined,
): string | undefined {
  if (!baseDomain) {
    return undefined;
  }
  return `https://kagent.${baseDomain}`;
}

/** Strip trailing slashes so URL joining stays predictable. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * kagent answered (or was reachable) and then failed: an `Internal`, an
 * `Unknown`, a timeout, a body that could not be read.
 *
 * Deliberately **not** the same error as "kagent is absent". That case is a 404
 * (see {@link transportFailure}): silenced by the frontend, and below the
 * `>= 500` threshold at which `MiddlewareFactory.error()` logs to Sentry, which
 * matters because it is the expected outcome on most installations.
 *
 * This one surfaces as a 500, so the frontend reports it *and* it reaches Sentry —
 * both correct here. A deployed-but-degraded kagent is rare and genuinely
 * actionable, and its sessions silently vanishing from the fleet-merged list would
 * be the worse failure.
 */
function upstreamError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstreamError';
  return error;
}

function isUpstreamError(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'UpstreamError';
}

/** Name of the error thrown when an A2A turn outlives its timeout. */
export const TURN_PENDING_ERROR_NAME = 'KagentTurnPendingError';

/**
 * The turn was dispatched and is still running.
 *
 * Deliberately not an upstream failure. `SendMessage` holds the connection until
 * the agent finishes, so losing that connection — to our own timeout, or to the
 * gateway's 60 s one — says "nobody waited long enough", not "broken". The turn is
 * already recorded against the instance, which is what
 * {@link KagentClient.sendMessage} confirms before reporting this, and the
 * conversation poll will show it progress and finish.
 *
 * The router turns this into a 202 rather than a 5xx, which
 * `MiddlewareFactory.error()` would forward to Sentry: one issue per long turn,
 * for the thing an agent is supposed to do.
 */
function turnPendingError(message: string): Error {
  const error = new Error(message);
  error.name = TURN_PENDING_ERROR_NAME;
  return error;
}

export function isTurnPendingError(error: unknown): boolean {
  return (error as Error | undefined)?.name === TURN_PENDING_ERROR_NAME;
}

/**
 * Marks a `NotFoundError` that came from the **transport** rather than from
 * kagent.
 *
 * An unreachable host is reported as a 404 deliberately: on a fleet where most
 * installations run no kagent, that is the normal outcome and must stay off the
 * 5xx path. But the same branch also catches a socket that died *mid-request*,
 * which for a send is a lost connection, not an absent kagent.
 *
 * Carried as a property rather than a distinct error name because the name is
 * load-bearing: the frontend keys "no kagent here, stay silent" off `NotFoundError`,
 * and renaming it would make every kagent-less installation noisy.
 */
const TRANSPORT_FAILURE = Symbol.for('kagent.transportFailure');

function transportFailure(message: string): Error {
  const error = new NotFoundError(message);
  (error as unknown as Record<symbol, boolean>)[TRANSPORT_FAILURE] = true;
  return error;
}

export function isTransportFailure(error: unknown): boolean {
  return Boolean(
    (error as unknown as Record<symbol, boolean> | undefined)?.[
      TRANSPORT_FAILURE
    ],
  );
}

/**
 * Whether a Connect `Unavailable` is the network saying nobody is there, rather
 * than a gateway or kagent answering with a 5xx. connect-node reports both under
 * `Unavailable`; only the socket-level ones mean "kagent is not deployed here".
 */
const SOCKET_FAILURE = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ENETUNREACH|socket hang up|certificate|TLS|SSL/i;

/** Whether a configured URL is absolute and http(s), so a transport can use it. */
function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve the installations this proxy can target, keyed by name.
 *
 * `agentPlatform.kagent.installations`, when present, acts as the allowlist and
 * each entry's `apiBaseUrl` overrides the derived URL. When absent, every
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
      apiBaseUrl: stripTrailingSlash(apiBaseUrl),
    });
  }

  return result;
}

/**
 * The gRPC-Web transport toward one installation's controller.
 *
 * HTTP/1.1 on purpose: gRPC-Web is what crosses the agentgateway edge (native
 * gRPC over h2 is not promised there), and Node's `https` honours
 * `NODE_EXTRA_CA_CERTS`, which is how the lab's CA reaches this process.
 */
export function createKagentTransport(
  installation: KagentInstallationConfig,
): Transport {
  return createGrpcWebTransport({
    baseUrl: installation.apiBaseUrl,
    httpVersion: '1.1',
  });
}

/** The A2A metadata key that selects the AgentInstance a turn belongs to. */
const AGENT_INSTANCE_HEADER = 'x-kagent-agent-instance-id';

/** The HITL extension URI kagent `main` declares for confirmations and questions. */
const HITL_EXTENSION = 'https://kagent.dev/extensions/hitl/v1';

/**
 * Client for one installation's kagent `main` controller, over gRPC-Web.
 *
 * Speaks the control plane (`AgentInstanceService`, `AgentTemplateService`,
 * `SystemService`) and the A2A v1 service, and **answers in the shapes kagent
 * 0.10 answered in** — the `{error, data}` envelope around 0.10 session rows, and
 * the legacy A2A v0 task JSON — so the router, the session-state and usage
 * readers and the frontend's schemas need no change. The rendering lives in
 * `./kagent/wire`; this class is transport plus error mapping.
 *
 * A "session" in the method names is an AgentInstance: one conversation of one
 * person with one AgentTemplate on one Harness. Its id is the instance id.
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
    /** Overridable for tests (`createRouterTransport`); defaults to gRPC-Web toward `apiBaseUrl`. */
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
   * `AgentInstanceService/ListAgentInstances` — the caller's instances, as 0.10
   * session rows inside the envelope. Creator-scoped by kagent on `x-user-id`.
   */
  async listSessions(options: KagentRequestOptions): Promise<unknown> {
    const response = await this.call(
      () => this.instanceService.listAgentInstances({}, this.callOptions(options)),
      { endpoint: 'instance list', missingResource: 'AgentInstances' },
    );
    return envelope(response.agentInstances.map(toSessionWire));
  }

  /**
   * `AgentInstanceService/CreateAgentInstance` — start a conversation with one
   * agent, i.e. one AgentTemplate on one Harness.
   *
   * The harness is the caller's to name; when it does not, the first harness
   * whose `Ready` condition on the template is `True` is picked, falling back to
   * the first that admits the template at all. A template nothing admits cannot
   * be instantiated, and that is a stale picker rather than a fault, so it is a
   * 409 naming the agent.
   *
   * `request_id` makes the create idempotent on kagent's side; a fresh UUID per
   * call is what makes this a create.
   */
  async createSession(
    agent: { namespace: string; name: string; harness?: string },
    name: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const agentRef = `${agent.namespace}/${agent.name}`;
    const harness = agent.harness ?? (await this.pickHarness(agent, options));

    const response = await this.call(
      () =>
        this.instanceService.createAgentInstance(
          {
            harness: { namespace: agent.namespace, name: harness },
            agentTemplate: { namespace: agent.namespace, name: agent.name },
            requestId: randomUUID(),
            name,
          },
          this.callOptions(options),
        ),
      {
        endpoint: 'instance create',
        missingResource: `Installation '${this.installation.name}' cannot start a session: kagent does not know the agent '${agentRef}' on harness '${harness}'.`,
        invalidArgument: () =>
          new ConflictError(
            `kagent on installation '${this.installation.name}' did not accept the agent '${agentRef}' on harness '${harness}'. It may have been deleted, or it may not be deployed there.`,
          ),
      },
    );
    return envelope(
      response.agentInstance ? toSessionWire(response.agentInstance) : undefined,
    );
  }

  /**
   * `AgentInstanceService/GetAgentInstance` — the session object, as 0.10's
   * `{data: {session}}`.
   *
   * kagent scopes this by the caller, so a session belonging to somebody else is
   * indistinguishable from one that does not exist: both answer `NotFound`. That
   * is an expected outcome for a stale or shared deep link, mapped to a 404.
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
      },
    );
    return envelope({
      session: response.agentInstance
        ? toSessionWire(response.agentInstance)
        : undefined,
    });
  }

  /**
   * `A2AService/ListTasks` for one instance — the conversation, its state and
   * per-message token usage, as the v0 task list inside the envelope.
   *
   * The instance is named by the `x-kagent-agent-instance-id` metadata alone;
   * kagent scopes the listing to that instance's context, so no `context_id`
   * needs reading first. Oldest first, as `/sessions/:id/tasks` answered.
   */
  async listSessionTasks(
    sessionId: string,
    options: KagentRequestOptions,
    // The session-state summary reads many of these in one pass and gives each a
    // shorter leash than the client default, so one hung connection cannot spend
    // the whole pass's budget.
    extra: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    const tasks = await this.readTasks(sessionId, options, extra.timeoutMs);
    return envelope(sortTasksOldestFirst(tasks).map(toV0Task));
  }

  /**
   * Send one message to an instance's agent, as a turn of the conversation.
   *
   * `A2AService/SendMessage` with the instance in metadata; the agent's namespace
   * and name are accepted for the route's sake but the instance already binds the
   * template, so they are not sent. Answers with the finished task in v0 JSON,
   * inside a JSON-RPC-shaped result the frontend's send path tolerates.
   *
   * **It answers with the finished task**, not an acknowledgement, and a failed
   * turn is still a success at the transport: `status.state === 'failed'` carries
   * the reason. Waiting a turn out is usually impossible — see the gateway note on
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
   * Send one message, **streaming** the turn's events as kagent produces them.
   *
   * `A2AService/SendStreamingMessage` (server-streaming gRPC-Web), each response
   * rendered as a v0 `message/stream` event and relayed as one SSE `data:` frame in
   * the JSON-RPC shape kagent 0.10 streamed — so the router relays bytes and the
   * frontend's stream reducer is untouched. The returned {@link Response} has been
   * opened (its first event awaited) so that a rejection before the turn starts
   * surfaces as an error here rather than as an empty stream; the caller relays its
   * body and owns its lifetime through `signal`.
   *
   * Losing this connection — a gateway's door, a browser that navigated away —
   * does not stop the turn; the conversation poll shows it finish.
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
    const stream = this.a2aService.sendStreamingMessage(request, {
      headers: this.turnHeaders(sessionId, options),
      signal,
    })[Symbol.asyncIterator]();

    // The first event is awaited under the ordinary request timeout: kagent
    // answers a `task` snapshot as soon as the turn is accepted, so a slow start
    // means kagent is unwell, not that the agent is thinking.
    let first: IteratorResult<Awaited<ReturnType<typeof stream.next>>['value']>;
    try {
      first = await this.withTimeout(stream.next(), this.timeoutMs, signal);
    } catch (error) {
      if (signal.aborted) {
        // The caller hung up before kagent answered. Nothing to report to
        // anyone — rethrown for the router to swallow as a closed connection.
        throw error;
      }
      throw this.mapError(error, {
        endpoint: 'agent messaging',
        missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
      });
    }

    const encoder = new TextEncoder();
    const frame = (event: JsonObject) =>
      encoder.encode(
        `data: ${JSON.stringify({
          jsonrpc: '2.0',
          id: message.messageId,
          result: event,
        })}\n\n`,
      );
    const logger = this.logger;
    const installationName = this.installation.name;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done) {
            const event = toV0StreamEvent(first.value);
            if (event) {
              controller.enqueue(frame(event));
            }
          }
          while (!first.done) {
            const next = await stream.next();
            if (next.done) {
              break;
            }
            const event = toV0StreamEvent(next.value);
            if (event) {
              controller.enqueue(frame(event));
            }
          }
        } catch (error) {
          // The stream died mid-turn (a gateway's request timeout, an Envoy
          // drain) or the relay was aborted. Nothing more to relay and nothing
          // to report: an unterminated stream is the frontend's cue to fall back
          // to the poll, and the turn keeps running regardless.
          logger.debug(
            `A kagent event stream for installation '${installationName}' ended before the turn did`,
            { error: String(error) },
          );
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
   * A pending confirmation is not answerable with a plain message: a reply with no
   * `task_id` starts a new task and strands the suspended one. Naming the task is
   * what turns the reply into a resume. The decision travels as it did on 0.10 — a
   * `data` part carrying `decision_type` (mandatory, also for a question),
   * positional `ask_user_answers` and a flat `rejection_reason` — with the HITL
   * extension kagent `main` declares named on the message. A `text` part is
   * transcript-only.
   */
  async answerConfirmation(
    sessionId: string,
    _agent: { namespace: string; name: string },
    answer: {
      messageId: string;
      taskId: string;
      decision: 'approve' | 'reject';
      /** Positional, one entry per question. Empty for an approval. */
      answers?: string[][];
      rejectionReason?: string;
      /** What to show in the transcript as the user's words. */
      text?: string;
    },
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const data: JsonObject = { decision_type: answer.decision };
    if (answer.answers && answer.answers.length > 0) {
      data.ask_user_answers = answer.answers.map(values => ({
        answer: values,
      }));
    }
    if (answer.decision === 'reject' && answer.rejectionReason) {
      data.rejection_reason = answer.rejectionReason;
    }

    const parts: PartInit[] = [
      {
        content: {
          case: 'data',
          value: fromJson(ValueSchema, data as JsonValue),
        },
      },
    ];
    if (answer.text) {
      parts.push({ content: { case: 'text', value: answer.text } });
    }

    return this.dispatch(
      sessionId,
      {
        messageId: answer.messageId,
        parts,
        taskId: answer.taskId,
        extensions: [HITL_EXTENSION],
      },
      options,
    );
  }

  /**
   * `AgentInstanceService/DeleteAgentInstance` — scoped to the caller, like the
   * reads. kagent answers the deleted instance; it is passed through in the
   * envelope, as 0.10's delete answered.
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
      },
    );
    return envelope(
      response.agentInstance ? toSessionWire(response.agentInstance) : undefined,
    );
  }

  /**
   * `AgentInstanceService/UpdateAgentInstanceName` — rename one session.
   *
   * kagent validates the name itself (200 characters, no control characters, no
   * leading or trailing whitespace); a rejected name is the caller's mistake and
   * answers 400.
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
        invalidArgument: message =>
          new InputError(
            `kagent on installation '${this.installation.name}' rejected the session name: ${message}`,
          ),
      },
    );
    return envelope(
      response.agentInstance ? toSessionWire(response.agentInstance) : undefined,
    );
  }

  /**
   * `AgentTemplateService/ListAgentTemplates` — the agents of one namespace,
   * each with the harnesses that admit it and their readiness, plus the CR
   * itself (`status.harnesses[]` included) under `resource`.
   */
  async listAgentTemplates(
    namespace: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const response = await this.call(
      () =>
        this.templateService.listAgentTemplates(
          { namespace },
          this.callOptions(options),
        ),
      { endpoint: 'template list', missingResource: 'AgentTemplates' },
    );
    return envelope(response.agentTemplates.map(templateSummary));
  }

  /** `SystemService/GetVersion` — the controller's version. No identity needed. */
  async getVersion(options: KagentRequestOptions = {}): Promise<unknown> {
    const response = await this.call(
      () => this.systemService.getVersion({}, this.callOptions(options)),
      { endpoint: 'version', missingResource: 'version' },
    );
    return {
      kagent_version: response.kagentVersion,
      git_commit: response.gitCommit,
      build_date: response.buildDate,
    };
  }

  /**
   * `SystemService/GetCurrentUser` — the identity kagent resolved for the call:
   * the token's claims when it verified one, else `{sub: <x-user-id>}`. Under the
   * trusted-header mode the lab runs, `sub` is therefore the email we sent, which
   * is exactly what makes the frontend's "is this list mine" probe work.
   */
  async getMe(options: KagentRequestOptions): Promise<unknown> {
    const response = await this.call(
      () => this.systemService.getCurrentUser({}, this.callOptions(options)),
      { endpoint: 'current user', missingResource: 'current user' },
    );
    const claims: JsonObject = response.claims ?? {};
    const sub =
      (typeof claims.sub === 'string' && claims.sub) ||
      (typeof claims.email === 'string' && claims.email) ||
      identityHeaders(options)['x-user-id'];
    return { ...claims, ...(sub && { sub }) };
  }

  /**
   * Post one A2A message and report honestly on what became of it.
   *
   * Shared by {@link sendMessage} and {@link answerConfirmation} because the hard
   * part is identical for both and must not drift: a turn outliving its transport.
   */
  private async dispatch(
    sessionId: string,
    message: {
      messageId: string;
      parts: PartInit[];
      taskId?: string;
      extensions?: string[];
    },
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
      },
    });

    let task: Task | undefined;
    try {
      const response = await this.call(
        () =>
          this.a2aService.sendMessage(request, {
            headers: this.turnHeaders(sessionId, options),
            timeoutMs: this.turnTimeoutMs,
          }),
        {
          endpoint: 'agent messaging',
          missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
          timeoutIsPending: true,
          invalidArgument: reason =>
            new ConflictError(
              `The agent on installation '${this.installation.name}' did not accept the message: ${reason}`,
            ),
        },
      );
      task = response.payload.case === 'task' ? response.payload.value : undefined;
      if (response.payload.case === 'message') {
        // A bare message reply, without a task: nothing to render as a turn.
        // Wrapped in the JSON-RPC shape the frontend's send path tolerates.
        return { jsonrpc: '2.0', id: message.messageId, result: toV0StreamEvent(
          { $typeName: 'lf.a2a.v1.StreamResponse', payload: response.payload },
        ) };
      }
    } catch (error) {
      // A lost connection is not a failed message. The gateway in front of kagent
      // cuts the request off long before an agent is done, and the turn keeps
      // running regardless. So the only honest way to report this is to go and
      // look: if the message reached the instance's tasks, it was dispatched and
      // the conversation poll will show it finish; if it did not, the failure was
      // real. A decision — a 401, a 403, a rejected request, an unknown instance —
      // is not verified.
      if (
        !isUpstreamError(error) &&
        !isTurnPendingError(error) &&
        !isTransportFailure(error)
      ) {
        throw error;
      }
      if (!(await this.hasMessageLanded(sessionId, message.messageId, options))) {
        throw error;
      }
      this.logger.debug(
        `A kagent turn outlived its transport on installation '${this.installation.name}'; the message was dispatched and is still running`,
      );
      throw turnPendingError(
        `The agent on installation '${this.installation.name}' is still working on the message; the connection closed before it finished.`,
      );
    }

    return {
      jsonrpc: '2.0',
      id: message.messageId,
      result: task ? toV0Task(task) : undefined,
    };
  }

  /**
   * Whether a message we sent is in the instance's tasks.
   *
   * Only asked after the send's transport failed, so there has been ample time
   * for kagent to have written it — and a read failure here answers "cannot
   * tell", which keeps the original error rather than inventing a second one.
   */
  private async hasMessageLanded(
    sessionId: string,
    messageId: string,
    options: KagentRequestOptions,
  ): Promise<boolean> {
    try {
      const tasks = await this.readTasks(sessionId, options);
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
    timeoutMs?: number,
  ): Promise<Task[]> {
    const response = await this.call(
      () =>
        this.a2aService.listTasks(
          { historyLength: TASK_HISTORY_LENGTH, includeArtifacts: true },
          {
            headers: this.turnHeaders(sessionId, options),
            timeoutMs: timeoutMs ?? this.timeoutMs,
          },
        ),
      {
        endpoint: 'task list',
        missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
      },
    );
    return response.tasks;
  }

  /**
   * The harness a new instance of this template runs on: the first `Ready` one,
   * else the first that admits the template. None at all is a 409 — the template
   * exists but nothing can run it, which is a platform state the user cannot fix
   * from a session composer.
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
        `No harness admits the agent '${agent.namespace}/${agent.name}' on installation '${this.installation.name}', so no session can be started for it. Its AgentTemplate needs a kagent.dev/harness label that a Harness selects.`,
      );
    }
    if (!pick.ready) {
      this.logger.debug(
        `No harness reports the agent '${agent.namespace}/${agent.name}' Ready on installation '${this.installation.name}'; starting on '${pick.name}' anyway`,
      );
    }
    return pick.name;
  }

  private callOptions(options: KagentRequestOptions, timeoutMs?: number) {
    return {
      headers: identityHeaders(options),
      timeoutMs: timeoutMs ?? this.timeoutMs,
    };
  }

  private turnHeaders(
    sessionId: string,
    options: KagentRequestOptions,
  ): Record<string, string> {
    return {
      ...identityHeaders(options),
      [AGENT_INSTANCE_HEADER]: sessionId,
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

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ConnectError('first event timed out', Code.DeadlineExceeded));
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

  /**
   * Map a Connect failure onto the error the caller should see.
   *
   * - `Unauthenticated` / `PermissionDenied` are kagent's decisions about the
   *   forwarded identity: 401 / 403.
   * - `NotFound` is kagent saying the resource is gone (or somebody else's): 404
   *   with the endpoint's own wording. `Unimplemented` is a controller that
   *   predates the RPC.
   * - `InvalidArgument` is a rejected request; each caller says what that means.
   * - `AlreadyExists` / `FailedPrecondition` / `Aborted` are conflicts.
   * - `DeadlineExceeded` is our own timeout: a pending turn for a send, an
   *   upstream failure otherwise (kagent is deployed and unwell, not absent).
   * - `Unavailable` splits: a socket-level cause (nothing listening, no such host,
   *   a TLS refusal) is "kagent is not deployed here" — a 404 the frontend
   *   silences, marked transport-borne so a send verifies rather than reports;
   *   anything else is a gateway or kagent answering 5xx, an upstream failure.
   * - Everything else (`Internal`, `Unknown`, …) is an upstream failure.
   */
  private mapError(error: unknown, context: ErrorContext): Error {
    const connectError = ConnectError.from(error);
    const reason = connectError.rawMessage || connectError.message;
    const installationName = this.installation.name;

    switch (connectError.code) {
      case Code.Unauthenticated:
        return new AuthenticationError(
          `Not authenticated against the kagent API for installation '${installationName}'.`,
        );
      case Code.PermissionDenied:
        return new NotAllowedError(
          `Not authorized to use the kagent API for installation '${installationName}'.`,
        );
      case Code.NotFound:
        return new NotFoundError(context.missingResource);
      case Code.Unimplemented:
        return new NotFoundError(
          `The kagent API for installation '${installationName}' has no ${context.endpoint} endpoint; it is probably running a version that predates it.`,
        );
      case Code.InvalidArgument:
        return context.invalidArgument
          ? context.invalidArgument(reason)
          : upstreamError(
              `The kagent API for installation '${installationName}' rejected the request: ${reason}`,
            );
      case Code.AlreadyExists:
      case Code.FailedPrecondition:
      case Code.Aborted:
        return new ConflictError(
          `The kagent API for installation '${installationName}' reported a conflict: ${reason}`,
        );
      case Code.DeadlineExceeded:
      case Code.Canceled:
        this.logger.debug(
          `kagent request timed out for installation '${installationName}'`,
          { endpoint: context.endpoint },
        );
        if (context.timeoutIsPending) {
          return turnPendingError(
            `The agent on installation '${installationName}' has not finished within ${this.turnTimeoutMs}ms; the turn is still running.`,
          );
        }
        return upstreamError(
          `The kagent API for installation '${installationName}' did not respond in time.`,
        );
      case Code.Unavailable:
        if (SOCKET_FAILURE.test(reason)) {
          // DNS failure, TLS error or connection refused: nothing is reachable at
          // that host, i.e. kagent is not deployed on this installation. On a
          // fleet where only a couple of installations run kagent, this is the
          // normal, expected outcome for most of them on every page view, so it
          // is a 404 and not a 5xx `MiddlewareFactory.error()` would forward to
          // Sentry once per installation per page view.
          this.logger.debug(
            `kagent is not reachable for installation '${installationName}'`,
            { error: reason },
          );
          return transportFailure(
            `The kagent API is not available for installation '${installationName}'.`,
          );
        }
        this.logger.debug(
          `kagent API unavailable for installation '${installationName}'`,
          { error: reason },
        );
        return upstreamError(
          `The kagent API for installation '${installationName}' is unavailable: ${reason}`,
        );
      default:
        this.logger.debug(
          `kagent API returned an error for installation '${installationName}'`,
          { code: Code[connectError.code], error: reason },
        );
        return upstreamError(
          `The kagent API for installation '${installationName}' failed: ${reason}`,
        );
    }
  }
}

/** How one RPC's failures read to the user. */
interface ErrorContext extends NotFoundContext {
  /** Report a timeout as {@link turnPendingError}, for a call whose work continues after we stop waiting. */
  timeoutIsPending?: boolean;
  /** What a rejected request means for this call; the generic upstream failure otherwise. */
  invalidArgument?: (reason: string) => Error;
}

/** A `Part` as `create(SendMessageRequestSchema, …)` accepts it. */
type PartInit = Pick<Part, 'content'>;

/** One AgentTemplate for the templates route: the reference, the harnesses and the CR. */
function templateSummary(template: AgentTemplate): JsonObject {
  return {
    ref: template.ref
      ? { namespace: template.ref.namespace, name: template.ref.name }
      : undefined,
    description: template.description,
    ...(template.modelConfigRef && {
      model_config_ref: {
        namespace: template.modelConfigRef.namespace,
        name: template.modelConfigRef.name,
      },
    }),
    harnesses: harnessesOf(template),
    ready: harnessesOf(template).some(harness => harness.ready),
    resource: templateResource(template),
  };
}
