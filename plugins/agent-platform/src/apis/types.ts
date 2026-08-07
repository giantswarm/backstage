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

  /** Identity kagent resolved, used to detect a non-user-scoped deployment. */
  getIdentity(installation: string): Promise<KagentIdentity>;
}
