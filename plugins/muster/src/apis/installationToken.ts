/**
 * Which token reaches which muster.
 *
 * The portal signs a person in through ONE Dex (`gs.authProvider`). The
 * installation whose `oidcTokenProvider` is that provider is the *home*
 * installation, and its muster trusts the main-login ID token (the portal's own
 * Dex client is among the audiences it accepts). Every other muster trusts only
 * its own Dex, so the portal sends it the token the cluster token broker mints
 * for that installation (`aud: [dex-k8s-authenticator, …]`) -- the same token
 * the kagent and model-manager clients already send.
 */

/**
 * Whether `installation` is the home installation, i.e. reached with the
 * main-login token rather than a brokered one.
 *
 * Answers "home" whenever the question cannot be decided: a cluster the
 * kubernetes API does not know, or a portal without `gs.authProvider` (there is
 * no broker without a main provider). Both keep the main-token path.
 */
export function isHomeInstallation(
  cluster: { oidcTokenProvider?: string } | undefined,
  mainProvider: string | undefined,
): boolean {
  if (!cluster || !mainProvider) {
    return true;
  }
  return cluster.oidcTokenProvider === mainProvider;
}

/**
 * Why no token could be produced for a muster:
 * - `session-expired` -- the person's main portal session is gone; the single
 *   main re-login fixes it (nothing on the muster side is wrong).
 * - `mint-failed` -- anything else: the installation is unknown to the
 *   kubernetes API, the token broker is unreachable, the exchange failed.
 */
export type MusterTokenMintFailure = 'session-expired' | 'mint-failed';

export const MUSTER_TOKEN_MINT_ERROR_NAME = 'MusterTokenMintError';

/**
 * Thrown by `MusterApiClient` before a request is sent when the token for the
 * target installation cannot be obtained. Distinct from the proxy's
 * `UnauthorizedError`, which means a token WAS sent and muster rejected it.
 */
export class MusterTokenMintError extends Error {
  readonly installation: string | undefined;
  readonly reason: MusterTokenMintFailure;

  constructor(
    installation: string | undefined,
    reason: MusterTokenMintFailure,
    message: string,
  ) {
    super(message);
    this.name = MUSTER_TOKEN_MINT_ERROR_NAME;
    this.installation = installation;
    this.reason = reason;
  }

  /** Classifies a failure of the per-installation mint. */
  static fromMintFailure(
    installation: string,
    cause: unknown,
  ): MusterTokenMintError {
    const detail =
      (cause as { message?: string } | null | undefined)?.message ??
      String(cause);
    if (isSessionExpiredError(cause)) {
      return new MusterTokenMintError(
        installation,
        'session-expired',
        `Your portal session has expired; no token could be minted for muster on ${installation}.`,
      );
    }
    return new MusterTokenMintError(
      installation,
      'mint-failed',
      `Could not mint a token for muster on ${installation}: ${detail}`,
    );
  }
}

export function isMusterTokenMintError(
  error: unknown,
): error is MusterTokenMintError {
  return (
    (error as { name?: string } | null | undefined)?.name ===
    MUSTER_TOKEN_MINT_ERROR_NAME
  );
}

/**
 * Whether a mint failure means the person's main portal session is gone.
 * Recognises the gs cluster-token broker's typed error (`ClusterTokenError`
 * with reason `session-expired` / `subject_invalid`) by shape, so the muster
 * plugin needs no dependency on the gs plugin, and the wording the broker and
 * Backstage's auth APIs use when a re-login was declined.
 */
export function isSessionExpiredError(error: unknown): boolean {
  const e = error as
    { name?: string; reason?: string; message?: string } | null | undefined;
  if (!e) {
    return false;
  }
  if (e.name === 'ClusterTokenError') {
    return e.reason === 'session-expired' || e.reason === 'subject_invalid';
  }
  return /session[ -]?expired|sign in again|login did not complete/i.test(
    e.message ?? '',
  );
}
