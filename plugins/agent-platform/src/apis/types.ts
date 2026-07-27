import { KagentSession } from '../lib/kagentSessions';

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
   * Read-only and user-scoped: kagent lists sessions with
   * `WHERE user_id = <sub of the forwarded token>`, and exposes no cross-user
   * listing at all.
   *
   * Throws typed errors (`NotFoundError`, `UnauthorizedError`,
   * `ForbiddenError`, `ServiceUnavailableError`) so callers can tell "kagent
   * isn't deployed here" from "we couldn't read it".
   */
  listSessions(installation: string): Promise<KagentSession[]>;

  /** Identity kagent resolved, used to detect a non-user-scoped deployment. */
  getIdentity(installation: string): Promise<KagentIdentity>;
}
