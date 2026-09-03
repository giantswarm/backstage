import { KagentSession } from '../lib/kagentSessions';
import { KagentSessionDetail } from '../lib/kagentSessionDetail';
import { A2aTaskWire } from '../lib/kagentTaskSchema';

/**
 * Header carrying the user's per-installation Dex OIDC ID token, read by the
 * agent-platform-backend proxy and promoted to `Authorization: Bearer` toward
 * kagent.
 *
 * Must match KAGENT_AUTH_HEADER in plugins/agent-platform-backend.
 */
export const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

/** Identity kagent resolved for a forwarded token. */
export type KagentIdentity = {
  /** The `sub` kagent used to scope the session query, when it reported one. */
  sub?: string;
};

export interface KagentApi {
  /** Installations the backend can proxy kagent for. Names only. */
  listInstallations(): Promise<string[]>;

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
   * Start a session with one agent, and return its id.
   *
   * A session is only a shell: creating one does not say anything to the agent.
   * Talking happens through {@link sendMessage} with the returned id, which is
   * the A2A `contextId` — the only link between the two.
   *
   * `name` is required even though kagent treats it as optional, because the
   * controller does not auto-title: a session created without one has no title at
   * all. Derive it with `deriveSessionTitle`.
   *
   * The agent's namespace and name are its **real** ones, as read from its
   * `Agent` CR — never decoded from a session's `agent_id`, whose encoding is
   * lossy.
   *
   * As with {@link renameSession}, a 400 here does **not** mean "kagent isn't
   * available on this installation": it is how kagent reports an agent it cannot
   * resolve, which the backend turns into a 409.
   */
  createSession(
    installation: string,
    agent: { namespace: string; name: string },
    name: string,
  ): Promise<{ sessionId: string }>;

  /**
   * Delete one session.
   *
   * kagent scopes this by the forwarded token's user id and deletes **softly**:
   * the row keeps its events and tasks, but every read filters it out, so the
   * session is gone as far as this plugin can tell.
   *
   * Resolves for anything kagent accepts, which includes deleting a session that
   * was already deleted or belongs to somebody else — its statement simply matches
   * no rows and still answers 200. So a resolved promise means "kagent accepted
   * this", not "a session was definitely removed".
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
    message: { messageId: string; text: string },
  ): Promise<void>;

  /**
   * {@link sendMessage} over A2A `message/stream`: the same act, but the turn's
   * events are handed to `onEvent` as kagent produces them, so the caller can
   * show the reply while it is being written.
   *
   * `onEvent` receives each JSON-RPC frame's `result` verbatim — a legacy-wire
   * `task` / `status-update` / `artifact-update` / `message` event; interpret it
   * with `applyStreamEvent`. The stream is a preview only: everything it carries
   * is also written to the task history the poll reads, which stays the source
   * of truth.
   *
   * Resolving means the stream ended — **not** that the turn did. Gateways cut
   * long-lived responses (60 s on a stock route) and the turn survives the cut,
   * so a resolve without a terminal event means "still running, follow the
   * poll", the exact contract of {@link sendMessage}'s 202.
   *
   * Rejections split the same way the backend splits them: a **decision** (a
   * rejected request, an unknown agent, an in-band A2A error) throws its mapped
   * error, while a **transport** failure — the connection died, an unexpected
   * response shape — throws an error named `StreamTransportError`, which is the
   * caller's cue to verify against the session history rather than report a
   * failure that may not have happened.
   */
  streamMessage(
    installation: string,
    sessionId: string,
    agent: { namespace: string; name: string },
    message: { messageId: string; text: string },
    onEvent: (result: unknown) => void,
  ): Promise<void>;

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
    answer: {
      messageId: string;
      taskId: string;
      decision: 'approve' | 'reject';
      answers?: string[][];
      rejectionReason?: string;
      text?: string;
    },
  ): Promise<void>;

  /** Identity kagent resolved, used to detect a non-user-scoped deployment. */
  getIdentity(installation: string): Promise<KagentIdentity>;
}
