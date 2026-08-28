import { useCallback, useEffect, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  useMutation,
  useQuery,
  useQueryClient,
  QueryClient,
} from '@tanstack/react-query';
import { musterApiRef, ServerAuthStatus } from '../../apis';

/** How often `auth://status` is re-read while a browser sign-in is pending. */
const DEFAULT_POLL_INTERVAL_MS = 5_000;

/**
 * How long to keep polling for an unfinished sign-in. A real IdP round-trip
 * comfortably outlives the 3 minutes this used to be (Miro's flow alone walks
 * through an organization picker, a team picker, and a consent page, before
 * any MFA prompt), and a deadline that fires mid-flow made a *successful*
 * sign-in look like nothing had happened. Still bounded so an abandoned flow
 * eventually stops polling.
 */
const DEFAULT_POLL_TIMEOUT_MS = 15 * 60 * 1_000;

/** Statuses that mean the user themselves can still act (sign in). */
const NEEDS_LOGIN: ServerAuthStatus['status'][] = [
  'auth_required',
  'reauth_required',
];

/**
 * Muster's own `signed_out` confirmation is written for CLI users -- it ends
 * with "Use core_auth_login with server='x' to re-authenticate", an
 * instruction that reads as wrong advice next to the returning Sign in
 * button. Unlike a refusal, where muster's words carry the reason and are
 * surfaced verbatim, this note only confirms what the flipped affordance
 * already shows, so it is UI-authored.
 */
const SIGNED_OUT_NOTE =
  "Signed out — the server's tools are hidden until you sign in again.";

/**
 * A sign-in this browser tab started and is still waiting on. Held in the
 * react-query cache rather than component state so it outlives the row that
 * started it: on the MCP servers page the affordance lives inside a
 * `DisclosureAccordion`, which unmounts its children when collapsed, and losing
 * the pending flow there would reproduce exactly the "nothing happened" symptom
 * this feature exists to fix. Re-mounting the row resumes the same wait.
 */
interface PendingSignIn {
  authUrl: string;
  /** Epoch ms after which polling gives up. Survives remounts with the entry. */
  deadline: number;
  /** How muster identifies itself to the AS, when it reported one. */
  clientIdMethod?: 'cimd' | 'dcr' | 'cimd-fallback' | 'dcr-failed';
}

function pendingKey(installation: string | undefined, serverName: string) {
  return ['muster', 'pending-sign-in', installation, serverName] as const;
}

/**
 * `null` rather than `undefined` for "nothing pending": react-query rejects a
 * queryFn that resolves to undefined.
 */
function readPending(
  queryClient: QueryClient,
  installation: string | undefined,
  serverName: string,
): PendingSignIn | null {
  return (
    queryClient.getQueryData<PendingSignIn | null>(
      pendingKey(installation, serverName),
    ) ?? null
  );
}

export interface ServerSignInState {
  /** This server's entry in `auth://status`, when muster reports one. */
  status?: ServerAuthStatus;
  /** True while `core_auth_login` is in flight. */
  isPending: boolean;
  /** Muster's sign-in URL, once it has issued a challenge for this server. */
  authUrl?: string;
  /**
   * How muster identifies itself to the server's authorization server, when
   * the challenge reported it (muster#1083). `cimd-fallback` means the AS
   * advertises neither CIMD support nor dynamic client registration, and
   * `dcr-failed` (muster#1086) that the AS rejected muster's registration; in
   * both the sign-in may be rejected as an unregistered client — worth
   * warning about.
   */
  clientIdMethod?: 'cimd' | 'dcr' | 'cimd-fallback' | 'dcr-failed';
  /** True while polling for the browser sign-in to complete. */
  isWaiting: boolean;
  /** Muster's message for a refused (or unrecognised) login attempt. */
  error?: string;
  /** Muster's message for an outcome that isn't a failure (already connected). */
  note?: string;
  /**
   * The server is SSO-managed (token forwarding/exchange): its connection is
   * established from muster's own session, so a user sign-in cannot fix it.
   */
  isSsoManaged: boolean;
  /** Whether muster reports this server as needing a user sign-in. */
  needsLogin: boolean;
  /** Whether muster reports this server as connected for this session. */
  isConnected: boolean;
  /** True while `core_auth_logout` is in flight. */
  isSigningOut: boolean;
  signIn: () => void;
  signOut: () => void;
}

export interface UseServerSignInOptions {
  /** Overridable so tests can drive the poll without real wall-clock waits. */
  pollIntervalMs?: number;
  /** Overridable for the same reason: how long to wait before giving up. */
  timeoutMs?: number;
}

/**
 * Drives muster's downstream, per-server OAuth flow for one aggregated MCP
 * server.
 *
 * Signing in to muster (`musterApi.signIn`) says nothing about the servers
 * muster aggregates: each OAuth-protected server needs its own flow, started by
 * muster's `core_auth_login`. That returns a sign-in URL the user opens in a
 * browser; muster's OAuth callback then connects the server for this muster
 * session, with no further tool call. There is no push signal for that, so this
 * hook polls `auth://status` while the flow is outstanding and clears itself
 * (invalidating every muster query, so hidden tools appear) once the server
 * reports `connected`.
 *
 * The `auth://status` query is keyed per installation, so several rows on the
 * same page share one request.
 */
export function useServerSignIn(
  serverName: string,
  installation?: string,
  options: UseServerSignInOptions = {},
): ServerSignInState {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  // Subscribing via useQuery (rather than reading the cache directly) is what
  // re-renders this row when the pending entry is written or cleared.
  const { data: pending } = useQuery<PendingSignIn | null>({
    queryKey: pendingKey(installation, serverName),
    // Cache-only: nothing fetches this, the mutation and the effects below own
    // it.
    queryFn: () => readPending(queryClient, installation, serverName),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const setPending = useCallback(
    (value: PendingSignIn | null) => {
      queryClient.setQueryData(pendingKey(installation, serverName), value);
    },
    [queryClient, installation, serverName],
  );

  const authUrl = pending?.authUrl;
  const clientIdMethod = pending?.clientIdMethod;
  const isWaiting = Boolean(authUrl);

  const { data, error: statusError } = useQuery({
    queryKey: ['muster', 'auth-status', installation],
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: Boolean(installation),
    refetchInterval: isWaiting ? pollIntervalMs : false,
    // The flow completes while the user is on the IdP's tab -- which is
    // precisely when react-query pauses interval refetches by default
    // (refetchIntervalInBackground: false). Poll through it, so the wait can
    // end while the user is still looking at the other tab.
    refetchIntervalInBackground: true,
    // Returning from the IdP tab is THE moment to re-read status. The muster
    // QueryClient turns focus refetches off globally, so opt this one cheap
    // query back in; it is also what lets a sign-in that outlived the
    // deadline below resolve instead of leaving a stale "Sign in" affordance.
    refetchOnWindowFocus: true,
    // An unavailable status resource, or a 401 before the user has connected to
    // muster, are expected answers -- retrying each three times only multiplies
    // the noise.
    retry: false,
  });

  const status = data?.servers?.find(server => server.name === serverName);

  // The proxy answers 200 with `unavailable` when it could not read
  // auth://status, so a waiting row can say the status is unreadable instead of
  // claiming to still be waiting for the user. A thrown error (a 401 before the
  // user has a muster session) is treated the same way.
  const statusUnreadable =
    data?.unavailable || statusError
      ? `Cannot read the muster auth status${
          (data?.message ?? statusError?.message)
            ? `: ${data?.message ?? statusError?.message}`
            : ''
        }`
      : undefined;

  const signIn = useMutation({
    mutationFn: () => musterApi.signInServer(serverName, installation),
    onSuccess: result => {
      if (result.status === 'auth_required' && result.authUrl) {
        setPending({
          authUrl: result.authUrl,
          deadline: Date.now() + timeoutMs,
          clientIdMethod: result.clientIdMethod,
        });
        return;
      }
      setPending(null);
      if (result.status === 'connected') {
        queryClient.invalidateQueries({ queryKey: ['muster'] });
      }
    },
  });

  // The inverse flow. Muster revokes the session's auth for the server
  // synchronously, so unlike signIn there is nothing to poll for: on any
  // answer that may have changed auth state ('signed_out', or 'unknown' where
  // the truth must be re-read), invalidating every muster query is what
  // re-gates the server's tools and brings the sign-in affordance back. An
  // 'error' answer is a refusal -- nothing changed, so nothing is refetched.
  const signOut = useMutation({
    mutationFn: () => musterApi.signOutServer(serverName, installation),
    onSuccess: result => {
      if (result.status !== 'error') {
        queryClient.invalidateQueries({ queryKey: ['muster'] });
      }
    },
  });

  // At the deadline the entry is CLEARED, not rewritten. Keeping it would leave
  // the row permanently visible (`authUrl` truthy defeats the idle gate)
  // offering a challenge whose `state` is expired or consumed by now. Clearing
  // returns the row to a plain `Sign in`; a flow that completes even later is
  // still picked up by the focus refetch above plus the transition effect
  // below.
  useEffect(() => {
    if (!pending) {
      return undefined;
    }
    const timer = setTimeout(
      () => setPending(null),
      Math.max(0, pending.deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pending, setPending]);

  // The browser flow completed: muster connected the server for this session.
  // Only `connected` ends the wait -- the same condition muster's CLI waits for
  // (`waitForServerAuthWithClient`). Any other status means the flow hasn't
  // landed yet, so keep polling until the deadline rather than silently dropping
  // the sign-in link.
  //
  // The needs-login -> connected transition is tracked independently of the
  // pending entry: a sign-in that outlived the deadline (or was completed from
  // another view sharing this muster session) must still unblock the page when
  // a later read -- the focus refetch above -- reports it connected. Keyed on
  // the last KNOWN status so an `unavailable` gap between reads cannot fake a
  // transition, and NOT on first sight of an already-connected server, which
  // would invalidate every muster query on every page load.
  const lastKnownStatusRef = useRef<ServerAuthStatus['status'] | undefined>(
    undefined,
  );
  useEffect(() => {
    const current = status?.status;
    if (current === undefined) {
      return;
    }
    const previous = lastKnownStatusRef.current;
    lastKnownStatusRef.current = current;
    if (current !== 'connected') {
      return;
    }
    const signedInFromNeedsLogin =
      previous !== undefined && NEEDS_LOGIN.includes(previous);
    if (!pending && !signedInFromNeedsLogin) {
      return;
    }
    if (pending) {
      setPending(null);
    }
    queryClient.invalidateQueries({ queryKey: ['muster'] });
  }, [pending, status, queryClient, setPending]);

  // Feedback (`note`/`error`) intentionally lives in the mutation rather than the
  // shared pending entry, and is intentionally NOT reset when the reported status
  // moves on:
  //
  // - It cannot pin a row open, because `idle` in ServerSignIn ignores it -- that
  //   was the harmful half of it outliving its state.
  // - Resetting on a status change would defeat keeping a refusal visible: muster
  //   refusing with something specific (a rate limit) and the next poll flipping
  //   the entry to SSO-managed is exactly the sequence where the message matters
  //   most, and it would be wiped before it could be read.
  //
  // Accepted limit: it is per-row state, so collapsing a DisclosureAccordion
  // drops it (unlike the pending sign-in). A dropped confirmation is recoverable
  // -- clicking again re-reports it -- whereas a dropped wait was not, which is
  // why only the wait was moved into the cache.
  const signInResult = signIn.data;
  const isFailure =
    signInResult?.status === 'error' || signInResult?.status === 'unknown';
  const signOutResult = signOut.data;
  const isSignOutFailure =
    signOutResult?.status === 'error' || signOutResult?.status === 'unknown';

  return {
    status,
    isPending: signIn.isPending,
    authUrl,
    clientIdMethod,
    isWaiting,
    // Muster's own words for a refusal, or the mutation's transport error. A
    // failed status read is only worth showing while a sign-in is outstanding:
    // then it explains a wait that can never end, whereas outside a flow it is
    // just noise next to content the user didn't ask about (the servers page
    // renders this above its own "connect to muster" gate).
    error:
      (isFailure ? signInResult?.message : undefined) ??
      signIn.error?.message ??
      (isSignOutFailure ? signOutResult?.message : undefined) ??
      signOut.error?.message ??
      (pending ? statusUnreadable : undefined),
    // 'connected' with the alert still up is a real combination (the two come
    // from different muster state), and silence there is indistinguishable from
    // the no-op click this feature fixes. Same for a completed sign-out: the
    // affordance flips back to "Sign in", and the note is what says why.
    note:
      (signInResult?.status === 'connected'
        ? signInResult.message
        : undefined) ??
      (signOutResult?.status === 'signed_out' ? SIGNED_OUT_NOTE : undefined),
    isSsoManaged: Boolean(
      status?.token_forwarding_enabled || status?.token_exchange_enabled,
    ),
    needsLogin: status ? NEEDS_LOGIN.includes(status.status) : false,
    isConnected: status?.status === 'connected',
    isSigningOut: signOut.isPending,
    // Each action resets the other's feedback: after a sign-out, a lingering
    // "already connected" note from an earlier sign-in would contradict what
    // just happened (and vice versa) -- only the latest action gets to speak.
    signIn: () => {
      signOut.reset();
      signIn.mutate();
    },
    signOut: () => {
      signIn.reset();
      signOut.mutate();
    },
  };
}
