import {
  MUSTER_TOKEN_EXPIRED_TEXT,
  readJwtLifetimeClaims,
  type MusterUnauthorizedReason,
} from '@giantswarm/backstage-plugin-gs-common';
import { isUnauthorizedTransportError } from '../mcp';
import { MusterAuthRequiredError, MusterToolError } from './MusterMcpClient';

export type { MusterUnauthorizedReason } from '@giantswarm/backstage-plugin-gs-common';

/**
 * A 401 of a muster proxy, with its reason (`MusterUnauthorizedReason`). The
 * proxy answers it with the reason and the server in the body; the message
 * never carries a token, an identity or muster's own text, which may name the
 * person. Arguments in the order of the muster frontend's error of the same
 * name.
 */
export class MusterUnauthorizedError extends Error {
  override readonly name = 'MusterUnauthorizedError';
  readonly status = 401;

  constructor(
    message: string,
    readonly reason: MusterUnauthorizedReason,
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

export function musterTokenExpiredError(
  installation: string,
): MusterUnauthorizedError {
  return new MusterUnauthorizedError(
    `The token forwarded to the muster installation '${installation}' has expired.`,
    'token_expired',
  );
}

export function musterTokenMissingError(
  installation: string,
  why: string,
): MusterUnauthorizedError {
  return new MusterUnauthorizedError(
    `The muster installation '${installation}' requires a user token ${why}, but the request did not include one.`,
    'token_missing',
  );
}

/**
 * The 401 a muster call's failure is, or `undefined` when it is none: muster
 * asking for the person's sign-in to a server, muster refusing the forwarded
 * bearer at its transport, or muster reporting that bearer expired. A
 * refused bearer counts as expired when its `exp` says so.
 */
export function toMusterUnauthorizedError(
  error: unknown,
  context: { installation: string; authToken?: string; now?: number },
): MusterUnauthorizedError | undefined {
  if (error instanceof MusterUnauthorizedError) {
    return error;
  }
  if (error instanceof MusterAuthRequiredError) {
    return new MusterUnauthorizedError(
      // muster's own wording, which frontends from before `reason` match
      // on (a tab left open across a deploy runs one).
      `auth_required: server '${error.server}' requires authentication; sign in to it to use its tools.`,
      'server_sign_in_required',
      error.server,
    );
  }
  const expiredText =
    error instanceof MusterToolError &&
    MUSTER_TOKEN_EXPIRED_TEXT.test(error.message);
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
    `The muster installation '${context.installation}' did not accept the forwarded token.`,
    'token_rejected',
  );
}
