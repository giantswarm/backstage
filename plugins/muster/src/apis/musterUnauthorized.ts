import {
  isMusterUnauthorizedReason,
  musterProviderAppGrantsOf,
  type MusterProviderAppGrant,
  type MusterUnauthorizedReason,
} from '@giantswarm/backstage-plugin-gs-common';
import { causeChain } from '@giantswarm/backstage-plugin-ui-react';
import { isMusterTokenMintError } from './installationToken';

export type {
  MusterProviderAppGrant,
  MusterUnauthorizedReason,
} from '@giantswarm/backstage-plugin-gs-common';

/**
 * A 401 of muster-backend. `name` stays `UnauthorizedError`, the name every
 * caller already keys on; `reason` and `server` say what to do about it. An
 * answer from an older backend (or a proxy in front of it) carries no reason.
 * `errorName` is the name the answer's body gives the error: the portal's
 * own refusal of the person's session token (Backstage's
 * `AuthenticationError`, before muster-backend runs) tells itself apart by
 * it from muster-backend's own 401s. `apps`: the provider Apps a
 * `server_sign_in_required` asks the person to grant, when muster asks for
 * those rather than a sign-in to the server.
 */
export class MusterUnauthorizedError extends Error {
  readonly name = 'UnauthorizedError';
  readonly status = 401;

  constructor(
    message: string,
    readonly reason?: MusterUnauthorizedReason,
    readonly server?: string,
    readonly installation?: string,
    readonly errorName?: string,
    readonly apps: MusterProviderAppGrant[] = [],
  ) {
    super(message);
  }
}

/**
 * The reason, server and provider Apps of a 401 body
 * (`{ error: { reason, server, apps } }`).
 */
export function unauthorizedBodyOf(body: unknown): {
  reason?: MusterUnauthorizedReason;
  server?: string;
  apps: MusterProviderAppGrant[];
} {
  const { reason, server, apps } =
    (
      body as {
        error?: { reason?: unknown; server?: unknown; apps?: unknown };
      } | null
    )?.error ?? {};
  return {
    reason: isMusterUnauthorizedReason(reason) ? reason : undefined,
    server: typeof server === 'string' && server !== '' ? server : undefined,
    apps: musterProviderAppGrantsOf(apps),
  };
}

/**
 * What the muster-backend 401 in `error`'s cause chain says, if there is one:
 * its reason, the server, the installation and the provider Apps to grant
 * (none of them from an answer without a reason).
 */
export function musterUnauthorizedInfoOf(error: unknown):
  | {
      reason?: MusterUnauthorizedReason;
      server?: string;
      installation?: string;
      apps?: MusterProviderAppGrant[];
    }
  | undefined {
  for (const candidate of causeChain(error)) {
    const { name, status, reason, server, installation, apps } = candidate as {
      name?: unknown;
      status?: unknown;
      reason?: MusterUnauthorizedReason;
      server?: string;
      installation?: string;
      apps?: MusterProviderAppGrant[];
    };
    if (name === 'UnauthorizedError' || status === 401) {
      return candidate instanceof MusterUnauthorizedError
        ? { reason, server, installation, apps }
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
