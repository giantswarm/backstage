import { isSessionExpiredError } from '@giantswarm/backstage-plugin-kubernetes-react';

export { isSessionExpiredError };

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
 * Thrown by `MusterApiClient` when the token for the target installation cannot
 * be obtained before a request is sent, or when muster answers that the token
 * it got has expired. Distinct from the proxy's `UnauthorizedError`, which
 * means muster rejected a token for any other reason.
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

/** What the person reads when the token for a muster has lapsed. */
export const SESSION_EXPIRED_MESSAGE = 'Your session expired, sign in again.';

/**
 * The person's token for a muster has lapsed: the portal's own one before it
 * was sent, or the one muster answered as expired. Either way the single main
 * re-login fixes it, never a muster-side action.
 */
export function sessionExpiredError(
  installation: string | undefined,
): MusterTokenMintError {
  return new MusterTokenMintError(
    installation,
    'session-expired',
    SESSION_EXPIRED_MESSAGE,
  );
}

export function isMusterTokenMintError(
  error: unknown,
): error is MusterTokenMintError {
  return (
    (error as { name?: string } | null | undefined)?.name ===
    MUSTER_TOKEN_MINT_ERROR_NAME
  );
}
