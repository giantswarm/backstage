import {
  isMusterUnauthorizedReason,
  type MusterUnauthorizedReason,
} from '@giantswarm/backstage-plugin-gs-common';
import { isMusterTokenMintError } from './installationToken';

export type { MusterUnauthorizedReason } from '@giantswarm/backstage-plugin-gs-common';

/**
 * A 401 of muster-backend. `name` stays `UnauthorizedError`, the name every
 * caller already keys on; `reason` and `server` say what to do about it. An
 * answer from an older backend (or a proxy in front of it) carries no reason.
 */
export class MusterUnauthorizedError extends Error {
  readonly name = 'UnauthorizedError';
  readonly status = 401;

  constructor(
    message: string,
    readonly reason?: MusterUnauthorizedReason,
    readonly server?: string,
    readonly installation?: string,
  ) {
    super(message);
  }
}

/** The reason and server of a 401 body (`{ error: { reason, server } }`). */
export function unauthorizedBodyOf(body: unknown): {
  reason?: MusterUnauthorizedReason;
  server?: string;
} {
  const { reason, server } =
    (body as { error?: { reason?: unknown; server?: unknown } } | null)
      ?.error ?? {};
  return {
    reason: isMusterUnauthorizedReason(reason) ? reason : undefined,
    server: typeof server === 'string' && server !== '' ? server : undefined,
  };
}

/**
 * `error` and the errors it was made from (`cause`): the plugins that call
 * muster wrap its errors in their own (`ClusterManagerError`, ...) and keep
 * the original as the cause.
 */
function* causeChain(error: unknown): Generator<unknown> {
  let current = error;
  for (let depth = 0; current && depth < 5; depth++) {
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

/**
 * What the muster-backend 401 in `error`'s cause chain says, if there is one:
 * its reason, the server and the installation (none of them from an answer
 * without a reason).
 */
export function musterUnauthorizedInfoOf(error: unknown):
  | {
      reason?: MusterUnauthorizedReason;
      server?: string;
      installation?: string;
    }
  | undefined {
  for (const candidate of causeChain(error)) {
    const { name, status, reason, server, installation } = candidate as {
      name?: unknown;
      status?: unknown;
      reason?: MusterUnauthorizedReason;
      server?: string;
      installation?: string;
    };
    if (name === 'UnauthorizedError' || status === 401) {
      return candidate instanceof MusterUnauthorizedError
        ? { reason, server, installation }
        : {};
    }
  }
  return undefined;
}

/**
 * The server whose sign-in a failed muster call needs, when that is why it
 * failed: what a page offers the sign-in to.
 */
export function musterSignInRequiredOf(
  error: unknown,
): { server: string; installation?: string } | undefined {
  const unauthorized = musterUnauthorizedInfoOf(error);
  return unauthorized?.reason === 'server_sign_in_required' &&
    unauthorized.server
    ? { server: unauthorized.server, installation: unauthorized.installation }
    : undefined;
}

/**
 * Whether a failed muster read must not be retried: a 401, or a portal
 * session that is gone. Neither is transient. A retry only delays the sign-in
 * the page offers (the client already sent the call once more after
 * refreshing the token), or re-runs the re-login for a session that is gone.
 * A mint that failed otherwise (`mint-failed`: the broker unreachable, an
 * exchange that failed) may well work the next time, and is not one.
 */
export function isMusterAuthFailure(error: unknown): boolean {
  for (const candidate of causeChain(error)) {
    if (
      (isMusterTokenMintError(candidate) &&
        candidate.reason === 'session-expired') ||
      (candidate as { name?: unknown }).name === 'UnauthorizedError' ||
      (candidate as { status?: unknown }).status === 401
    ) {
      return true;
    }
  }
  return false;
}
