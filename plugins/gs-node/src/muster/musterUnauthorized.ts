import { readJwtLifetimeClaims } from '@giantswarm/backstage-plugin-gs-common';
import { isUnauthorizedTransportError } from '../mcp';
import { MusterAuthRequiredError, MusterToolError } from './MusterMcpClient';

/**
 * Why a muster proxy answers 401, in the body's `error.reason`. The frontend
 * picks its action from it (must match `MusterUnauthorizedReason` in
 * plugins/muster):
 *
 * - `server_sign_in_required` -- the person's muster session holds no grant
 *   for the server (`error.server`) the call needs: they sign in to it once.
 * - `token_missing` -- the request carried no token for an installation
 *   that needs the person's.
 * - `token_expired` -- the forwarded token has expired: the portal
 *   refreshes it and sends the call again.
 * - `token_rejected` -- muster refused a forwarded token that has not
 *   expired by its `exp`.
 *
 * Each is refused before a tool runs, so sending the call again with a new
 * token is safe even for a write.
 */
export type MusterUnauthorizedReason =
  | 'server_sign_in_required'
  | 'token_missing'
  | 'token_expired'
  | 'token_rejected';

/**
 * A 401 of a muster proxy, with its reason. The proxy answers it with the
 * reason and the server in the body; the message never carries a token, an
 * identity or muster's own text, which may name the person.
 */
export class MusterUnauthorizedError extends Error {
  override readonly name = 'MusterUnauthorizedError';
  readonly status = 401;

  constructor(
    readonly reason: MusterUnauthorizedReason,
    message: string,
    readonly server?: string,
  ) {
    super(message);
  }
}

/** Whether a JWT's `exp` has passed. A token without a readable `exp` has not. */
export function isTokenExpired(
  token: string | undefined,
  now: number = Date.now(),
): boolean {
  const { exp } = readJwtLifetimeClaims(token);
  return exp !== undefined && exp * 1000 <= now;
}

/**
 * muster's answer when the bearer it forwards to a server has lapsed, e.g.
 * `token has expired for workspace-manager, re-authenticate to refresh: …`.
 */
const MUSTER_TOKEN_EXPIRED = /token has expired\b.*\bre-authenticate/i;

export function musterTokenExpiredError(
  installation: string,
): MusterUnauthorizedError {
  return new MusterUnauthorizedError(
    'token_expired',
    `The token forwarded to the muster installation '${installation}' has expired.`,
  );
}

export function musterTokenMissingError(
  installation: string,
  why: string,
): MusterUnauthorizedError {
  return new MusterUnauthorizedError(
    'token_missing',
    `The muster installation '${installation}' requires a user token ${why}, but the request did not include one.`,
  );
}

/**
 * The 401 a muster call's failure is, or `undefined` when it is none: muster
 * asking for the person's sign-in to a server, muster refusing the forwarded
 * bearer at its transport, or muster reporting that bearer expired. A
 * refused bearer counts as expired when its `exp` says so.
 */
export function musterUnauthorizedOf(
  error: unknown,
  context: { installation: string; authToken?: string; now?: number },
): MusterUnauthorizedError | undefined {
  if (error instanceof MusterUnauthorizedError) {
    return error;
  }
  if (error instanceof MusterAuthRequiredError) {
    return new MusterUnauthorizedError(
      'server_sign_in_required',
      `'${error.server}' requires authentication: sign in to it to use its tools.`,
      error.server,
    );
  }
  const expiredText =
    error instanceof MusterToolError &&
    MUSTER_TOKEN_EXPIRED.test(error.message);
  if (expiredText) {
    return musterTokenExpiredError(context.installation);
  }
  if (!isUnauthorizedTransportError(error)) {
    return undefined;
  }
  if (isTokenExpired(context.authToken, context.now)) {
    return musterTokenExpiredError(context.installation);
  }
  return new MusterUnauthorizedError(
    'token_rejected',
    `The muster installation '${context.installation}' did not accept the forwarded token.`,
  );
}
