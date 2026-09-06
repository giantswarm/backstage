import { useCallback, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isMusterTokenMintError, musterApiRef } from '../../apis';
import { isMusterAuthError } from '../../lib/authError';
import { useMusterInstance } from './MusterInstanceProvider';

/**
 * Why there is no muster session for the active installation:
 * - `unreachable` -- the backend's unauthenticated probe says the muster
 *   endpoint cannot be reached from this portal (DNS, connection, TLS or
 *   timeout), so no token was minted and nothing was sent. There is nothing
 *   the person can do from here; the gate offers no action.
 * - `session-expired` -- no token could be minted because the person's main
 *   portal session is gone. The single main re-login fixes it; muster is fine.
 * - `mint-failed` -- no token could be minted for another reason (installation
 *   unknown to the kubernetes API, token broker unreachable, exchange failed).
 * - `muster-rejected` -- a token was sent and muster (or the proxy in front of
 *   it) answered with an error; `message` quotes it.
 */
export type MusterSessionFailureKind =
  'unreachable' | 'session-expired' | 'mint-failed' | 'muster-rejected';

export type MusterSessionFailure = {
  kind: MusterSessionFailureKind;
  /** A complete sentence naming the installation and the cause. */
  message: string;
};

export type MusterSession = {
  /** True once muster doesn't require auth, or a probe call succeeds. */
  authenticated: boolean;
  /**
   * True while the first probe for the active installation has not answered
   * yet -- the gates show a neutral "checking" state rather than a failure.
   */
  pending: boolean;
  /** Set once the probe failed; absent while pending or authenticated. */
  failure?: MusterSessionFailure;
  /** Whether a connect (re-mint + re-probe) round-trip is in flight. */
  connecting: boolean;
  /** Re-run the token mint for the active installation, then re-probe. */
  connect: () => Promise<void>;
};

/**
 * The human-readable part of a muster/proxy rejection. The muster-backend
 * relays muster's 401 as e.g. `MCP HTTP Transport Error: POSTing to endpoint
 * (HTTP 401): {"error":"invalid_token","error_description":"Token validation
 * failed"}`; the JSON body's description is what the person should read.
 */
export function musterRejectionDetail(message: string): string {
  const start = message.indexOf('{');
  if (start >= 0) {
    try {
      const body = JSON.parse(message.slice(start)) as Record<string, unknown>;
      const detail = [body.error_description, body.message, body.error].find(
        value => typeof value === 'string' && value.length > 0,
      );
      if (detail) {
        return detail as string;
      }
    } catch {
      // Not a JSON body; fall through to the raw message.
    }
  }
  return message;
}

/**
 * Maps the probe's error onto a failure class. A `MusterTokenMintError` never
 * reached muster (its `reason` is the class); anything else came back from the
 * proxy or muster, and an auth error there means the token was rejected.
 */
export function classifySessionFailure(
  error: unknown,
  installation: string | undefined,
): MusterSessionFailure {
  if (isMusterTokenMintError(error)) {
    return { kind: error.reason, message: error.message };
  }
  const where = installation ? ` on ${installation}` : '';
  const raw = (error as { message?: string } | null | undefined)?.message;
  const detail = musterRejectionDetail(raw ?? 'no details');
  if (isMusterAuthError(error)) {
    return {
      kind: 'muster-rejected',
      message: `muster${where} rejected the token: ${detail}`,
    };
  }
  return {
    kind: 'muster-rejected',
    message: `muster${where} answered with an error: ${detail}`,
  };
}

/**
 * The failure for an installation whose muster the backend reports as not
 * reachable from this portal. Nothing was tried on the person's behalf, so the
 * sentence names the fact and the backend's reason, not an action.
 */
export function unreachableFailure(
  installation: string | undefined,
  reason: string | undefined,
): MusterSessionFailure {
  const where = installation ? ` on ${installation}` : '';
  const why = reason ? ` (${reason})` : '';
  return {
    kind: 'unreachable',
    message: `muster${where} is not reachable from this portal${why}.`,
  };
}

/**
 * Resolves whether the browsing user has an authenticated muster session for
 * the active installation, why not if not, and exposes a connect action. A
 * single lightweight `filter_tools(limit=1)` probe doubles as the auth check:
 * the token for the installation is minted on the way (main-login token for
 * the home installation, the installation's brokered token otherwise), so a
 * failure is either the mint or muster's answer, and `failure` says which.
 * Shared by every surface that gates muster mutations/tools so they agree on
 * session state (ADR D3) -- the probe is keyed per installation so react-query
 * dedupes it across pages.
 *
 * The probe is not run at all for an installation the backend reports as not
 * reachable from this portal (`activeInstallationInfo.reachable === false`,
 * from its unauthenticated probe): it would mint a token for a request that
 * can only time out, and the gate would offer a connect that cannot help.
 * `failure.kind` is `'unreachable'` instead, with no action.
 */
export function useMusterSession(): MusterSession {
  const { activeInstallation, activeInstallationInfo } = useMusterInstance();
  const musterApi = useApi(musterApiRef);
  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;
  const unreachable = activeInstallationInfo?.reachable === false;
  const unreachableReason = activeInstallationInfo?.reason;
  const enabled = Boolean(activeInstallation) && !unreachable;

  const {
    data: probe,
    isError: probeFailed,
    error: probeError,
    status,
    refetch,
  } = useQuery({
    queryKey: ['muster', 'overview', activeInstallation],
    queryFn: () =>
      musterApi.filterTools({ installation: activeInstallation, limit: 1 }),
    enabled,
  });

  const authenticated =
    !unreachable && (!requiresAuth || (!probeFailed && Boolean(probe)));
  const pending = requiresAuth && enabled && status === 'pending';
  const failure = useMemo(() => {
    if (unreachable) {
      return unreachableFailure(activeInstallation, unreachableReason);
    }
    return requiresAuth && probeFailed
      ? classifySessionFailure(probeError, activeInstallation)
      : undefined;
  }, [
    unreachable,
    unreachableReason,
    requiresAuth,
    probeFailed,
    probeError,
    activeInstallation,
  ]);

  const [connecting, setConnecting] = useState(false);
  const connect = useCallback(async () => {
    if (unreachable) {
      // No action is offered for an unreachable muster; a caller that reaches
      // this anyway must not mint a token for a request that cannot arrive.
      return;
    }
    setConnecting(true);
    try {
      // signIn re-runs the mint (for a gone main session this is the single
      // main re-login) and reports success as a boolean; the re-probe below is
      // the source of truth either way, so its outcome is not inspected here.
      await musterApi.signIn(activeInstallation);
      await refetch();
    } finally {
      setConnecting(false);
    }
  }, [musterApi, activeInstallation, refetch, unreachable]);

  return { authenticated, pending, failure, connecting, connect };
}
