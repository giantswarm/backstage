import { KagentInstallation } from '../lib/kagentInstallations';
import {
  A2aTaskWire,
  KagentSession,
  KagentSessionDetail,
  MessageImage,
  ModelCostResponse,
  SessionStatesResponse,
  SessionUsageResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * A message the person sends: its id (minted by the caller), its text, and
 * the images attached to it.
 */
export type OutboundMessage = {
  messageId: string;
  text: string;
  images?: readonly MessageImage[];
};

export type { KagentInstallation } from '../lib/kagentInstallations';

/**
 * Header carrying the user's per-installation Dex OIDC ID token, read by the
 * agent-platform-backend proxy and promoted to `Authorization: Bearer` toward
 * kagent.
 *
 * Must match KAGENT_AUTH_HEADER in plugins/agent-platform-backend.
 */
export const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

/**
 * Response header carrying the request id the backend sent toward kagent, on
 * an error too.
 *
 * Must match REQUEST_ID_HEADER in plugins/agent-platform-backend.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/** The answer to a confirmation, as the answer routes take it. */
/**
 * How a stream that delivered events ended. `error` is the message of the
 * in-band `{error}` frame it ended with, when it ended with one — a controller
 * shutting down, a gateway cut, a runtime that could not be reached — and
 * undefined for a stream that simply closed.
 */
export type StreamEnd = { error?: string };

export type ConfirmationAnswerRequest = {
  messageId: string;
  taskId: string;
  decision: 'approve' | 'reject';
  answers?: string[][];
  rejectionReason?: string;
  text?: string;
};

/** Identity kagent resolved for a forwarded token. */
export type KagentIdentity = {
  /** The `sub` kagent used to scope the session query, when it reported one. */
  sub?: string;
  /** The token's `email` claim, when kagent reported one. */
  email?: string;
};

/** {@link KagentApi.getRawSession}'s answer: two route bodies, as they came. */
export type RawSessionBodies = {
  /** `GET /kagent/sessions/:id`: kagent's `GetSessionResponse`, `{session}`. */
  sessionBody: unknown;
  /** `GET /kagent/sessions/:id/tasks`: `{tasks, totalSize}`. */
  tasksBody: unknown;
};

export interface KagentApi {
  /**
   * Installations the backend can proxy kagent for, each with whether its
   * kagent endpoint is reachable from this portal (the backend's
   * unauthenticated probe; `'unknown'` until it has settled). Tolerates the
   * previous names-only shape, which reads as `'unknown'`.
   */
  listInstallations(): Promise<KagentInstallation[]>;

  /**
   * The signed-in user's sessions on one installation, already parsed and
   * normalized.
   *
   * User-scoped: kagent lists sessions with
   * `WHERE user_id = <sub of the forwarded token>`, and exposes no cross-user
   * listing at all.
   *
   * Throws typed errors (`NotFoundError`, `UnauthorizedError`,
   * `ForbiddenError`, `ServiceUnavailableError`) so callers can tell "kagent
   * isn't deployed here" from "we couldn't read it".
   */
  listSessions(installation: string): Promise<KagentSession[]>;

  /**
   * The signed-in user's sessions on one installation, but only when the
   * read is known to be complete: every row parsed, and the listing not cut
   * at the backend's page limit. Undefined otherwise. Throws as
   * {@link listSessions} does. For a caller that acts on a session's
   * *absence* (dropping what is stored about deleted sessions); a list shown
   * to the person uses {@link listSessions}, which keeps partial data.
   */
  listSessionsIfComplete(
    installation: string,
  ): Promise<KagentSession[] | undefined>;

  /**
   * One session's metadata, plus the message timestamps recovered from its
   * stored events.
   *
   * kagent scopes this by the forwarded token's user id, so a session belonging
   * to someone else raises `NotFoundError` exactly as a deleted one does. That is
   * the expected outcome for a stale deep link, not a fault.
   */
  getSessionDetail(
    installation: string,
    sessionId: string,
  ): Promise<KagentSessionDetail | undefined>;

  /**
   * The session's A2A tasks, in kagent's chronological order.
   *
   * Returned in wire form on purpose: the only consumer is `buildTimeline`,
   * which needs the full nested structure. Combining these with the timestamps
   * from {@link getSessionDetail} happens in the calling hook, because neither
   * request can see the other's result.
   */
  listSessionTasks(
    installation: string,
    sessionId: string,
  ): Promise<A2aTaskWire[]>;

  /**
   * The session route's and the tasks route's bodies, untouched, for a
   * Session export: nothing normalized, no row dropped, `totalSize` kept.
   *
   * The session is read first and the tasks only once it answered, so a
   * session that is not the caller's, or no longer exists, fails as the
   * session read's `NotFoundError` — never as the `ForbiddenError` kagent's
   * task listing answers for the same cases.
   */
  getRawSession(
    installation: string,
    sessionId: string,
  ): Promise<RawSessionBodies>;

  /**
   * Derived state for this installation's sessions — what the session lists
   * group by. Computed by the backend, because a session's state lives in its
   * whole conversation and reading every one of them in the browser is not
   * affordable.
   */
  listSessionStates(installation: string): Promise<SessionStatesResponse>;

  /**
   * The caller's token, turn and tool usage on this installation, over the
   * window the backend fixes — what the Usage tab reports.
   *
   * Computed by the backend for the same reason the states summary is: the
   * numbers live in every session's whole conversation, and totalling them in
   * the browser is not affordable.
   *
   * **These are one user's own numbers**, because kagent scopes its session
   * list to the forwarded token's subject. The exception is an installation
   * running kagent in `unsecure` mode, where the list is everyone's — detected
   * by `useKagentCapabilities`, and the page's copy has to switch rather than
   * claim ownership it cannot support.
   */
  getSessionUsage(installation: string): Promise<SessionUsageResponse>;

  /**
   * The caller's own model cost on one installation over the last `days`
   * days, as the gateway priced it. The backend takes the person from kagent
   * and builds the query itself, so nothing here names whose cost it is.
   */
  getModelCost(installation: string, days: number): Promise<ModelCostResponse>;

  /**
   * Stop the turn a session is running: cancel its task on the server.
   *
   * Cutting the stream does not stop a turn — the agent keeps working and the
   * poll shows it finish. This does: the controller cancels the run and records
   * the task canceled, so the turn stays stopped. Resolves once the controller
   * has answered, whether it canceled the task or found it already finished.
   */
  cancelTask(
    installation: string,
    sessionId: string,
    taskId: string,
  ): Promise<void>;

  /**
   * Delete one session.
   *
   * kagent scopes this to the caller and deletes **softly**: it tears the
   * session's runtime down and marks it deleted, but its record, tasks and events
   * stay in kagent's database. Every read answers 404 for it from then on, so the
   * session is gone as far as this plugin can tell.
   *
   * A session kagent does not find for the caller — never existed, somebody
   * else's, already deleted — rejects with a `NotFoundError` (a gRPC `NotFound`,
   * a 404 from the backend), not a silent success.
   */
  deleteSession(installation: string, sessionId: string): Promise<void>;

  /**
   * Rename one session.
   *
   * The caller is expected to have trimmed and length-checked the name; the
   * backend rejects anything else with a 400. Note that unlike the reads, a 400
   * here does **not** mean "kagent isn't available on this installation".
   *
   * Renaming on a kagent too old to support it is handled entirely in the
   * backend, which reads the session back and rewrites it — nothing about that
   * needs anything from here. See `KagentClient.updateSessionName` in
   * agent-platform-backend.
   */
  renameSession(
    installation: string,
    sessionId: string,
    name: string,
  ): Promise<void>;

  /**
   * Send one message to the session's agent, as a new turn.
   *
   * **Resolving does not mean the agent answered well** — only that kagent
   * accepted and ran the turn. A turn that failed (an agent that cannot reach its
   * MCP server, say) still comes back as a success here, carrying
   * `status.state: 'failed'` and a reason on the task. The conversation read is
   * what tells you what became of it, so nothing here inspects the result.
   *
   * It also resolves for a turn that is **still running**: kagent answers only
   * when the agent finishes, so the backend stops waiting after its turn timeout
   * and answers 202. Either way the caller's next move is the same — refresh the
   * conversation and let the poll follow it.
   *
   * `messageId` is generated by the caller so an optimistically rendered message
   * can be matched to the stored one and dropped when it arrives.
   *
   * As with {@link renameSession}, a 400 here does **not** mean "kagent isn't
   * available on this installation".
   */
  sendMessage(
    installation: string,
    sessionId: string,
    agent: { namespace: string; name: string },
    message: OutboundMessage,
  ): Promise<void>;

  /**
   * {@link sendMessage} over A2A `message/stream`: the same act, but the turn's
   * events are handed to `onEvent` as kagent produces them, so the caller can
   * show the reply while it is being written.
   *
   * `onEvent` receives each SSE frame's payload verbatim — an A2A v1
   * `StreamResponse` (`{task}` / `{statusUpdate}` / `{artifactUpdate}` /
   * `{message}`) as the backend relays it; interpret it with
   * `applyStreamEvent`, which also reads the legacy `kind`-discriminated
   * events. The stream is a preview only: everything it carries is also written
   * to the task history the poll reads, which stays the source of truth.
   *
   * Resolving means the stream ended — **not** that the turn did. Gateways cut
   * long-lived responses (60 s on a stock route) and the turn survives the cut,
   * so a resolve without a terminal event means "still running, follow the
   * poll", the exact contract of {@link sendMessage}'s 202.
   *
   * Rejections split the same way the backend splits them: a **decision** (a
   * rejected request, an unknown instance, a second message during a turn)
   * throws its mapped error, while a **transport** failure — the connection
   * died, an unexpected response shape — throws an error named
   * `StreamTransportError`, which is the caller's cue to verify against the
   * session history rather than report a failure that may not have happened. A
   * stream that ends with an `{error}` frame after events have flowed is neither:
   * the turn exists, and the poll is its record.
   *
   * `signal` aborts the stream — the request and its body. The caller pulls it
   * when the conversation poll shows the turn over while the stream is still
   * open, which is how a stream that hangs without ending is recognised; the
   * abort then surfaces exactly like any other cut.
   *
   * Resolves with how the stream ended ({@link StreamEnd}): the words of an
   * in-band error after events, which is what tells a lost runtime from a cut
   * that the turn survived.
   */
  streamMessage(
    installation: string,
    sessionId: string,
    agent: { namespace: string; name: string },
    message: OutboundMessage,
    onEvent: (result: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd>;

  /**
   * Answer the confirmation a session is suspended on, resuming the same task.
   *
   * **Not a variant of {@link sendMessage}.** A pending confirmation cannot be
   * answered with a plain message: without naming the task, kagent opens a new one
   * and the agent's original tool call never gets its response, leaving the task
   * suspended forever. `taskId` is what makes this a resume — read it from
   * `readPendingConfirmation`.
   *
   * `answers` is **positional**, one entry per question in the order asked, and
   * each entry is a list even for a single-select. Each value is the choice's own
   * text, not its index. Omit for an approval, which carries no answers.
   *
   * `decision` is required even for a question — kagent reads it before it looks at
   * the answers and ignores an answer that arrives without one.
   *
   * Resolving means kagent accepted the answer, not that the agent has finished
   * reacting to it; like `sendMessage`, a still-running turn also resolves.
   */
  answerConfirmation(
    installation: string,
    sessionId: string,
    agent: { namespace: string; name: string },
    answer: ConfirmationAnswerRequest,
  ): Promise<void>;

  /**
   * {@link answerConfirmation} over A2A `message/stream`: the same resume of the
   * same task, with the resumed turn's events handed to `onEvent` as kagent
   * produces them — the contract of {@link streamMessage}, applied to an answer.
   *
   * Preferred over the unary answer: that one is held open for the backend's
   * turn timeout and then answers 202, after which the page can only wait for
   * the conversation poll — and a turn that never lands leaves it nothing to
   * show. Over the stream the browser follows the turn, and a cut stream is
   * visible as such.
   */
  streamAnswer(
    installation: string,
    sessionId: string,
    agent: { namespace: string; name: string },
    answer: ConfirmationAnswerRequest,
    onEvent: (result: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd>;

  /**
   * Follow a running turn again: A2A `SubscribeToTask` on the turn's task,
   * relayed as {@link streamMessage} relays a turn — the task's snapshot
   * first, then its events from now on, or the final event of a task already
   * over. What a page does when a turn's stream ended before the turn did: a
   * controller rollout cuts every stream in flight, and the turns run on.
   *
   * Rejects as {@link streamMessage} does, and a retry is worth it exactly
   * when it rejects with a `StreamTransportError` or an `UpstreamError` (the
   * controller unavailable or slow while it rolls, said in-band); any other
   * error is a decision — not the person's turn, no such turn, one already
   * over — that no retry changes.
   */
  subscribeToTask(
    installation: string,
    sessionId: string,
    agent: { namespace: string; name: string },
    taskId: string,
    onEvent: (result: unknown) => void,
    signal?: AbortSignal,
  ): Promise<StreamEnd>;

  /** Identity kagent resolved, used to detect a non-user-scoped deployment. */
  getIdentity(installation: string): Promise<KagentIdentity>;

  /**
   * The namespaces of the Agents the person may list on the installation
   * (`ListAgents` with no namespace, as the person): with the controller's
   * Kubernetes authorizer, their tenants that hold an agent.
   */
  listAgentNamespaces(installation: string): Promise<string[]>;
}
