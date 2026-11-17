import { CustomErrorBase } from '@backstage/errors';

/** The name {@link InstallationAuthenticationError} carries to the browser. */
export const INSTALLATION_AUTHENTICATION_ERROR_NAME =
  'InstallationAuthenticationError';

/**
 * The person's token for an installation is missing, or the installation
 * (kagent, its gateway, Mimir) refused it: a 401 with a name of its own.
 *
 * Not Backstage's `AuthenticationError`, which the portal's backend answers
 * when it refuses the person's *portal* session token, before any route of
 * this plugin runs. The frontend says "your portal session ended" for that
 * one (`portalSession.ts` in the agent-platform plugin), so a refusal by the
 * installation must not share its name: it keeps its own message.
 *
 * `statusCode` is what `MiddlewareFactory.error()` answers with for a name it
 * does not know.
 */
export class InstallationAuthenticationError extends CustomErrorBase {
  override name = INSTALLATION_AUTHENTICATION_ERROR_NAME;
  readonly statusCode = 401;
}
