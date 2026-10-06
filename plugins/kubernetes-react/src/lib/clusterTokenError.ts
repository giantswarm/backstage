/**
 * Coarse, UI-facing reason why a broker-backed cluster token could not be
 * obtained. `session-expired` means the main Dex session is gone (and the
 * single SSO re-login was declined or failed); the others mirror the backend
 * cluster-token router's failure modes.
 */
export type ClusterTokenErrorReason =
  | 'session-expired'
  | 'broker_unreachable'
  | 'broker_unavailable'
  | 'exchange_failed'
  | 'subject_invalid'
  | 'unknown';

/**
 * Typed error thrown by a broker-backed `clusterTokenProvider`/refresh. Carries
 * the affected installation and a coarse reason so the cluster-access status
 * UI can show what went wrong without per-cluster login popups.
 */
export class ClusterTokenError extends Error {
  readonly installation: string;
  readonly reason: ClusterTokenErrorReason;

  constructor(
    installation: string,
    reason: ClusterTokenErrorReason,
    message?: string,
  ) {
    super(
      message ??
        `Cluster token request for installation "${installation}" failed: ${reason}`,
    );
    this.name = 'ClusterTokenError';
    this.installation = installation;
    this.reason = reason;
  }
}

/**
 * Whether a token failure means the person's main portal session is gone: the
 * cluster token broker's `ClusterTokenError` with reason `session-expired` or
 * `subject_invalid`, or the wording the broker and Backstage's auth APIs use
 * when a re-login was declined.
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof ClusterTokenError) {
    return (
      error.reason === 'session-expired' || error.reason === 'subject_invalid'
    );
  }
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return (
    typeof message === 'string' &&
    /session[ -]?expired|sign in again|login did not complete/i.test(message)
  );
}

/**
 * Whether the person declined a Login Required prompt (Backstage's
 * `RejectedError`) or closed its sign-in popup.
 */
export function isSignInDeclinedError(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown } | null | undefined;
  if (!e) {
    return false;
  }
  return (
    e.name === 'RejectedError' ||
    (typeof e.message === 'string' &&
      /login failed, popup was closed/i.test(e.message))
  );
}
