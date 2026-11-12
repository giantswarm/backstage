import { causeChain } from '@giantswarm/backstage-plugin-ui-react';

/** What the person reads wherever a page shows the error's message. */
export const PORTAL_SESSION_ENDED_MESSAGE =
  'Your portal session ended, for example because the portal restarted, so nothing was sent or saved. Reload the page to sign in again, then try again.';

/**
 * The portal's backend refused the person's session token: it answers 401
 * with Backstage's `AuthenticationError` before any plugin route runs, for
 * example after a restart that lost the keys it signed the token with (a
 * portal without a database keeps them in memory). Nothing was sent on.
 * Signing in again (a reload) gets a new token.
 */
export class PortalSessionEndedError extends Error {
  override readonly name = 'PortalSessionEndedError';

  constructor(options?: ErrorOptions) {
    super(PORTAL_SESSION_ENDED_MESSAGE, options);
  }
}

/** The name Backstage's backend gives a refused session token. */
const AUTHENTICATION_ERROR = 'AuthenticationError';

/**
 * Whether `error` is the portal's backend refusing the session token: a 401
 * whose body names Backstage's `AuthenticationError`. Read from the status
 * and the error's name, never its text:
 *
 * - a `ResponseError` of a plugin backend route (`statusCode`,
 *   `body.error.name`), such as the credential form's;
 * - a `MusterUnauthorizedError` of muster-backend (`status`, `errorName`),
 *   whose own 401s are named `MusterUnauthorizedError`.
 *
 * The agent-platform backend's credential route also answers
 * `AuthenticationError` when the request carries no installation token,
 * which a sign-in mints again too.
 */
export function isPortalSessionRefusal(error: unknown): boolean {
  if (error instanceof PortalSessionEndedError) {
    return true;
  }
  for (const candidate of causeChain(error)) {
    const { status, statusCode, errorName, body } = (candidate ?? {}) as {
      status?: unknown;
      statusCode?: unknown;
      errorName?: unknown;
      body?: { error?: { name?: unknown } };
    };
    if (
      (status === 401 && errorName === AUTHENTICATION_ERROR) ||
      (statusCode === 401 && body?.error?.name === AUTHENTICATION_ERROR)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `error`, or a {@link PortalSessionEndedError} in its place when it is the
 * portal refusing the session token: its message says what to do.
 */
export function portalSessionError<T>(error: T): T | PortalSessionEndedError {
  return isPortalSessionRefusal(error) &&
    !(error instanceof PortalSessionEndedError)
    ? new PortalSessionEndedError({ cause: error })
    : error;
}
