import { useCallback, useEffect, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  AuthStatusResponse,
  musterApiRef,
  ProviderAppAuthStatus,
  ServerAuthStatus,
} from '../../apis';

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

/**
 * How long muster honours the sign-in URL it issued. The URL only carries a
 * lookup key: the `state` behind it lives in muster's state store for 10
 * minutes (`defaultStateExpiry`, internal/oauth/state_store_valkey.go), after
 * which the start endpoint answers "Authentication session expired" -- well
 * inside the wait above. Observed live: a "Reopen sign-in page" link clicked
 * 12 minutes into a flow landed on that page, four times over. So the URL is
 * offered for a little less than the TTL (a click at the edge must still
 * land), and past that the affordance asks muster for a fresh challenge.
 */
const MUSTER_STATE_TTL_MS = 10 * 60 * 1_000;
const DEFAULT_AUTH_URL_LIFETIME_MS = MUSTER_STATE_TTL_MS - 60 * 1_000;

/** How long a status read counts as fresh for a row that mounts after it. */
const STATUS_FRESH_MS = 2_000;

/** Statuses that mean the user themselves can still act (sign in). */
const NEEDS_LOGIN: ServerAuthStatus['status'][] = [
  'auth_required',
  'reauth_required',
];

/**
 * Whether the server comes with the person's muster sign-in (token forwarding
 * or exchange): there is nothing of its own to sign in to. muster's `kind`
 * decides where it is sent; an older muster without it says so through the
 * two flags.
 */
export function isSsoServer(status: ServerAuthStatus): boolean {
  if (status.kind !== undefined) {
    return status.kind === 'sso';
  }
  return Boolean(
    status.token_forwarding_enabled || status.token_exchange_enabled,
  );
}

/**
 * Whether muster reports a server as waiting for this user's sign-in. Never an
 * SSO server: muster reports one `auth_required` before it connects it and
 * `reauth_required` once the server refused the person's sign-in, and neither
 * is fixed by signing in to it.
 */
export function needsSignIn(status: ServerAuthStatus): boolean {
  return NEEDS_LOGIN.includes(status.status) && !isSsoServer(status);
}

/**
 * Whether an SSO server refused the person's sign-in: muster's attempt failed
 * and the server is not connected in this session. The flag alone is not
 * enough, since muster keeps it per person and another session's failure
 * stands on a server this one is connected to; a server muster cannot reach
 * (`unreachable`) or is still retrying (`sso_pending`) did not refuse anything.
 */
export function isSsoRefused(status: ServerAuthStatus): boolean {
  return (
    isSsoServer(status) &&
    Boolean(status.sso_attempt_failed) &&
    NEEDS_LOGIN.includes(status.status)
  );
}

/**
 * Whether muster is still connecting the server with the person's portal
 * sign-in (`sso_pending`): its connect after a sign-in runs in the background
 * and settles within seconds, nothing waits for the person.
 */
export function isConnecting(status: ServerAuthStatus): boolean {
  return status.status === 'sso_pending';
}

/** How often `auth://status` is re-read while a server is connecting. */
export const CONNECTING_POLL_INTERVAL_MS = 2_000;

/**
 * The re-read interval while muster still connects one of the person's
 * servers, else false: a status read in the seconds after a sign-in settles
 * without a reload.
 */
export function connectingPollInterval(
  data: AuthStatusResponse | undefined,
): number | false {
  return data?.servers?.some(isConnecting)
    ? CONNECTING_POLL_INTERVAL_MS
    : false;
}

/** The per-installation `auth://status` read every sign-in affordance shares. */
export function authStatusQueryKey(installation?: string) {
  return ['muster', 'auth-status', installation] as const;
}

/**
 * Whether muster reports `serverName` as waiting for the person's sign-in
 * ({@link needsSignIn}), from the `auth://status` read the sign-in affordances
 * share: `undefined` until it is read. A status that cannot be read, or a
 * server it does not list, is `false`: nothing a sign-in is known to fix. For
 * a surface that offers the sign-in only where it can help.
 */
export function useServerNeedsSignIn(
  serverName: string,
  installation: string | undefined,
  options: { enabled?: boolean } = {},
): boolean | undefined {
  const musterApi = useApi(musterApiRef);
  const enabled = (options.enabled ?? true) && Boolean(installation);
  const { data, isPending, isError } = useQuery({
    queryKey: authStatusQueryKey(installation),
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled,
    staleTime: STATUS_FRESH_MS,
    retry: false,
  });
  if (!enabled) {
    return undefined;
  }
  if (isError) {
    return false;
  }
  if (isPending) {
    return undefined;
  }
  const status = findStatus(data, serverName, false);
  return status ? needsSignIn(status) : false;
}

/**
 * Muster's own `signed_out` confirmation is written for CLI users -- it ends
 * with "Use core_auth_login with server='x' to re-authenticate", an
 * instruction that reads as wrong advice next to the returning Sign in
 * button. Unlike a refusal, where muster's words carry the reason and are
 * surfaced verbatim, this note only confirms what the flipped affordance
 * already shows, so it is UI-authored.
 */
export function signedOutNote(noun: SignInNoun = 'server'): string {
  return `Signed out — the ${noun}'s tools are hidden until you sign in again.`;
}

/**
 * What the sign-in copy calls the thing signed in to: main's "server" (the
 * default, for the classic portal's surfaces such as Bot PRs' marge sign-in),
 * "connector" in the agent platform's own sections (muster's Connectors tab,
 * the agent wizard and detail pages).
 */
export type SignInNoun = 'server' | 'connector';

/**
 * A sign-in this browser tab started and is still waiting on. Held in the
 * react-query cache rather than component state so it outlives the row that
 * started it: on the MCP servers page the affordance lives inside a
 * `DisclosureAccordion`, which unmounts its children when collapsed, and losing
 * the pending flow there would reproduce exactly the "nothing happened" symptom
 * this feature exists to fix. Re-mounting the row resumes the same wait.
 */
interface PendingSignIn {
  /**
   * Muster's sign-in URL, while muster still honours it. Withdrawn on its own
   * (the entry stays) once the state behind it has expired: the wait goes on,
   * the URL does not.
   */
  authUrl?: string;
  /** Epoch ms after which muster refuses the URL's state. */
  authUrlExpiresAt: number;
  /** Epoch ms after which polling gives up. Survives remounts with the entry. */
  deadline: number;
  /** How muster identifies itself to the AS, when it reported one. */
  clientIdMethod?: 'cimd' | 'dcr' | 'cimd-fallback' | 'dcr-failed';
  /**
   * Whether the click already opened the sign-in page in another tab. False
   * means the popup was blocked, so the URL itself must be the affordance.
   */
  opened: boolean;
  /**
   * A provider App's device-code sign-in: the code the person enters at the
   * provider's page (opened in the tab instead of a sign-in URL).
   */
  deviceCode?: DeviceCode;
}

/** The code a device-code sign-in waits for, and where to enter it. */
export interface DeviceCode {
  userCode: string;
  verificationUrl: string;
  /** Epoch ms after which muster gives the code up, when it said. */
  expiresAt?: number;
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
  /**
   * This server's entry in `auth://status`, when muster reports one. A
   * provider App's entry in the shape of a server's: its `pending` (a code
   * outstanding) reads `auth_required` here, see `providerApp`.
   */
  status?: ServerAuthStatus;
  /** A provider App's own entry, with its code and last failure. */
  providerApp?: ProviderAppAuthStatus;
  /**
   * The code a provider App's device-code sign-in waits for: the one this tab
   * asked for, else the one muster reports outstanding (asked for elsewhere,
   * or before a reload). The person enters it at `verificationUrl`.
   */
  deviceCode?: DeviceCode;
  /** True while `core_auth_login` is in flight. */
  isPending: boolean;
  /**
   * Muster's sign-in URL, while muster still honours it. Only the popup-blocked
   * fallback renders it (the URL is then the only way into the flow); it is
   * withdrawn before the state behind it expires, and `signIn` then requests
   * a fresh challenge instead. `undefined` while `isWaiting` means exactly
   * that: the wait is still on, the earlier URL is not.
   */
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
  /**
   * Whether the sign-in page is already open in another tab (the click opens
   * it directly). False while waiting means the popup was blocked, so the UI
   * must offer the URL prominently instead of a mere re-open affordance.
   */
  signInTabOpened: boolean;
  /** Muster's message for a refused (or unrecognised) login attempt. */
  error?: string;
  /**
   * Why `auth://status` cannot be read, while a sign-in is outstanding. Also
   * reported as `error` when no answer to a click outranks it; set apart so a
   * status can tell a failed read from a failed sign-in.
   */
  statusUnreadable?: string;
  /** Muster's message for an outcome that isn't a failure (already connected). */
  note?: string;
  /**
   * The server is SSO-managed (token forwarding/exchange): its connection is
   * established from muster's own session, so a user sign-in cannot fix it.
   */
  isSsoManaged: boolean;
  /**
   * The SSO server refused the person's sign-in and is not connected for this
   * session ({@link isSsoRefused}): only an administrator can fix it.
   */
  isSsoRefused: boolean;
  /**
   * Whether muster reports this server as needing a user sign-in
   * ({@link needsSignIn}); never for an SSO server.
   */
  needsLogin: boolean;
  /** Whether muster reports this server as connected for this session. */
  isConnected: boolean;
  /** True while `core_auth_logout` is in flight. */
  isSigningOut: boolean;
  /**
   * Asks muster for a challenge and opens it in a new tab. Callable while a
   * flow is outstanding: that is how the sign-in page is reopened, since the
   * URL muster issued earlier may be expired by then. A fresh challenge
   * replaces the outstanding entry (and restarts the wait); a refusal leaves
   * it in place.
   */
  signIn: () => void;
  signOut: () => void;
}

export interface UseServerSignInOptions {
  /** Overridable so tests can drive the poll without real wall-clock waits. */
  pollIntervalMs?: number;
  /** Overridable for the same reason: how long to wait before giving up. */
  timeoutMs?: number;
  /** Overridable for the same reason: how long the issued URL is offered. */
  authUrlLifetimeMs?: number;
  /** What the hook's own notes call the server; main's "server" by default. */
  noun?: SignInNoun;
  /**
   * The name is a provider App muster keeps, not a server: the sign-in is
   * `core_auth_login app=<name>` and the state its `providerApps` entry in
   * `auth://status`.
   */
  app?: boolean;
}

/**
 * The entry `auth://status` reports for the server, or for the provider App
 * in the shape of a server's entry (an App has no SSO and no issuer).
 */
function findStatus(
  data: AuthStatusResponse | undefined,
  name: string,
  app: boolean,
): ServerAuthStatus | undefined {
  if (!app) {
    return data?.servers?.find(server => server.name === name);
  }
  const entry = findProviderApp(data, name);
  return (
    entry && {
      name: entry.name,
      status: entry.status === 'pending' ? 'auth_required' : entry.status,
      auth_tool: entry.auth_tool,
      error: entry.error,
    }
  );
}

function findProviderApp(
  data: AuthStatusResponse | undefined,
  name: string,
): ProviderAppAuthStatus | undefined {
  return data?.providerApps?.find(entry => entry.name === name);
}

/** The outstanding code muster reports for a provider App, if any. */
function reportedDeviceCode(
  entry: ProviderAppAuthStatus | undefined,
): DeviceCode | undefined {
  if (
    entry?.status !== 'pending' ||
    !entry.user_code ||
    !entry.verification_url
  ) {
    return undefined;
  }
  const expiresAt = entry.code_expires_at
    ? Date.parse(entry.code_expires_at)
    : NaN;
  return {
    userCode: entry.user_code,
    verificationUrl: entry.verification_url,
    expiresAt: Number.isNaN(expiresAt) ? undefined : expiresAt,
  };
}

/**
 * Drives muster's downstream, per-server OAuth flow for one aggregated MCP
 * server.
 *
 * Signing in to muster (`musterApi.signIn`) says nothing about the servers
 * muster aggregates: each OAuth-protected server needs its own flow, started by
 * muster's `core_auth_login`. That returns a sign-in URL, which the click opens
 * directly in a new tab; muster's OAuth callback then connects the server for
 * this muster session, with no further tool call. There is no push signal for
 * that, so this hook polls `auth://status` while the flow is outstanding and
 * clears itself (invalidating every muster query, so hidden tools appear) once
 * the server reports `connected`.
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
  const authUrlLifetimeMs =
    options.authUrlLifetimeMs ?? DEFAULT_AUTH_URL_LIFETIME_MS;
  const app = Boolean(options.app);
  // An App and a server may share a name; their waits must not.
  const pendingName = app ? `app:${serverName}` : serverName;
  const target = app ? { app: serverName } : serverName;

  // Subscribing via useQuery (rather than reading the cache directly) is what
  // re-renders this row when the pending entry is written or cleared.
  const { data: pending } = useQuery<PendingSignIn | null>({
    queryKey: pendingKey(installation, pendingName),
    // Cache-only: nothing fetches this, the mutation and the effects below own
    // it.
    queryFn: () => readPending(queryClient, installation, pendingName),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const setPending = useCallback(
    (value: PendingSignIn | null) => {
      queryClient.setQueryData(pendingKey(installation, pendingName), value);
    },
    [queryClient, installation, pendingName],
  );

  const authUrl = pending?.authUrl;
  const clientIdMethod = pending?.clientIdMethod;
  const isWaiting = Boolean(pending);
  const signInTabOpened = pending?.opened ?? false;

  const { data, error: statusError } = useQuery({
    queryKey: authStatusQueryKey(installation),
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: Boolean(installation),
    // A row that mounts right after a read (the sign-in dialog's rows, drawn
    // from the read it made on opening) does not read it again; polling,
    // focus and invalidation re-read regardless.
    staleTime: STATUS_FRESH_MS,
    // A provider App's code outstanding is a wait too, also one this tab did
    // not start (asked for before a reload, or in another tab).
    refetchInterval: query =>
      isWaiting ||
      (app &&
        findProviderApp(query.state.data, serverName)?.status === 'pending')
        ? pollIntervalMs
        : false,
    // The flow completes while the user is on the IdP's tab -- which is
    // precisely when react-query pauses interval refetches by default
    // (refetchIntervalInBackground: false). Poll through it, so the wait can
    // end while the user is still looking at the other tab.
    refetchIntervalInBackground: true,
    // Returning from the IdP tab is THE moment to re-read status. The muster
    // QueryClient turns focus refetches off globally, so opt this one cheap
    // query back in; it is also what lets a sign-in that outlived the
    // deadline below resolve instead of leaving a stale "Sign in" affordance.
    // 'always': a host QueryClient may trust an answer for a while, and the
    // return is soon after the last read.
    refetchOnWindowFocus: 'always',
    // An unavailable status resource, or a 401 before the user has connected to
    // muster, are expected answers -- retrying each three times only multiplies
    // the noise.
    retry: false,
  });

  const status = findStatus(data, serverName, app);
  const providerApp = app ? findProviderApp(data, serverName) : undefined;

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

  // The sign-in tab is pre-opened synchronously in the click handler (see
  // `signIn` below) and navigated here once muster's challenge arrives:
  // window.open from this callback would be outside the user gesture's call
  // stack, which is exactly what popup blockers block. A ref, not state --
  // only the click that opened the tab ever needs the handle again.
  const signInTabRef = useRef<Window | null>(null);

  const signIn = useTrackedMutation({
    event: null,
    untrackedReason: 'An authentication step, not a portal action.',
    mutationFn: () => musterApi.signInServer(target, installation),
    onSuccess: result => {
      const tab = signInTabRef.current;
      signInTabRef.current = null;
      if (result.status === 'pending' && result.deviceCode) {
        // A device-code sign-in: the tab shows the provider's page where the
        // code is entered, and muster files the grant once it is.
        const { userCode, verificationUrl } = result.deviceCode;
        const opened = Boolean(tab && !tab.closed);
        if (tab && !tab.closed) {
          tab.location.href = verificationUrl;
        }
        const now = Date.now();
        const parsed = result.deviceCode.expiresAt
          ? Date.parse(result.deviceCode.expiresAt)
          : NaN;
        const expiresAt = Number.isNaN(parsed) ? undefined : parsed;
        setPending({
          authUrlExpiresAt: expiresAt ?? now + timeoutMs,
          // muster gives the code up at its expiry; a little later, the wait
          // ends here too and the row offers a new code.
          deadline: (expiresAt ?? now + timeoutMs) + 30_000,
          opened,
          deviceCode: { userCode, verificationUrl, expiresAt },
        });
        queryClient.invalidateQueries({
          queryKey: authStatusQueryKey(installation),
        });
        return;
      }
      if (result.status === 'auth_required' && result.authUrl) {
        const opened = Boolean(tab && !tab.closed);
        if (tab && !tab.closed) {
          tab.location.href = result.authUrl;
        }
        const now = Date.now();
        setPending({
          authUrl: result.authUrl,
          authUrlExpiresAt: now + authUrlLifetimeMs,
          deadline: now + timeoutMs,
          clientIdMethod: result.clientIdMethod,
          opened,
        });
        return;
      }
      // No sign-in page to show (already connected, or a refusal) -- the
      // pre-opened tab would just strand the user on a blank page.
      tab?.close();
      if (result.status === 'connected') {
        setPending(null);
        queryClient.invalidateQueries({ queryKey: ['muster'] });
      }
      // A refusal changes nothing about a flow that is already outstanding:
      // a reopen that muster rate-limits must not cancel the wait on the tab
      // opened earlier, which may still complete. The refusal is reported
      // through `error` below; from idle there was nothing to keep anyway.
    },
    onError: () => {
      signInTabRef.current?.close();
      signInTabRef.current = null;
    },
  });

  // The inverse flow. Muster revokes the session's auth for the server
  // synchronously, so unlike signIn there is nothing to poll for: on any
  // answer that may have changed auth state ('signed_out', or 'unknown' where
  // the truth must be re-read), invalidating every muster query is what
  // re-gates the server's tools and brings the sign-in affordance back. An
  // 'error' answer is a refusal -- nothing changed, so nothing is refetched.
  //
  // A THROWN error is different from a refusal: it means the request or the
  // response was lost (network fault, a backend pod terminated by a rollout
  // mid-request), and by then muster may well have already revoked the auth --
  // observed live: muster logged the logout as successful while the answer
  // died with the pod, leaving the row claiming "Sign out" for a session that
  // was in fact signed out. The outcome is unknown either way, so re-read the
  // truth instead of trusting the stale row.
  const signOut = useTrackedMutation({
    event: null,
    untrackedReason: 'An authentication step, not a portal action.',
    mutationFn: () => musterApi.signOutServer(target, installation),
    onSuccess: result => {
      if (result.status !== 'error') {
        queryClient.invalidateQueries({ queryKey: ['muster'] });
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['muster'] });
    },
  });

  // At the deadline the entry is CLEARED, not rewritten. Keeping it would leave
  // the row permanently visible (`isWaiting` defeats the idle gate) for a flow
  // nobody is finishing. Clearing returns the row to a plain `Sign in`; a flow
  // that completes even later is still picked up by the focus refetch above
  // plus the transition effect below.
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

  // Well before that, the URL alone is withdrawn: muster refuses its `state`
  // after MUSTER_STATE_TTL_MS, so past that point the link would only ever
  // land on "Authentication session expired". The entry itself stays -- the
  // tab opened in time may still complete the flow, so polling continues --
  // and the affordance falls back to `signIn`, which fetches a fresh URL.
  useEffect(() => {
    if (!pending?.authUrl) {
      return undefined;
    }
    const timer = setTimeout(
      () => setPending({ ...pending, authUrl: undefined }),
      Math.max(0, pending.authUrlExpiresAt - Date.now()),
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

  // A provider App's code that muster gave up (expired, refused by the
  // provider) ends the wait at once: muster reads `auth_required` with the
  // last failure, and only a new code can still connect. Keyed on the
  // transition from `pending`, so a status read before muster issued this
  // tab's code cannot end the wait it just started.
  const lastAppStatusRef = useRef<ProviderAppAuthStatus['status'] | undefined>(
    undefined,
  );
  useEffect(() => {
    const current = providerApp?.status;
    if (current === undefined) {
      return;
    }
    const previous = lastAppStatusRef.current;
    lastAppStatusRef.current = current;
    if (
      previous === 'pending' &&
      current === 'auth_required' &&
      pending?.deviceCode
    ) {
      setPending(null);
    }
  }, [providerApp, pending, setPending]);

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
    providerApp,
    deviceCode: pending?.deviceCode ?? reportedDeviceCode(providerApp),
    isPending: signIn.isPending,
    authUrl,
    clientIdMethod,
    isWaiting,
    signInTabOpened,
    // Muster's own words for a refusal, or the mutation's transport error. A
    // transport error is prefixed with the action it belongs to: a raw
    // "Failed to fetch" next to the button reads as the page being broken,
    // not as this click's request having been lost. A failed status read is
    // only worth showing while a sign-in is outstanding: then it explains a
    // wait that can never end, whereas outside a flow it is just noise next
    // to content the user didn't ask about (the servers page renders this
    // above its own "connect to muster" gate).
    error:
      (isFailure ? signInResult?.message : undefined) ??
      (signIn.error
        ? `Sign-in request failed: ${signIn.error.message}`
        : undefined) ??
      (isSignOutFailure ? signOutResult?.message : undefined) ??
      (signOut.error
        ? `Sign-out request failed: ${signOut.error.message}`
        : undefined) ??
      (pending ? statusUnreadable : undefined),
    statusUnreadable: pending ? statusUnreadable : undefined,
    // 'connected' with the alert still up is a real combination (the two come
    // from different muster state), and silence there is indistinguishable from
    // the no-op click this feature fixes. Same for a completed sign-out: the
    // affordance flips back to "Sign in", and the note is what says why.
    note:
      (signInResult?.status === 'connected'
        ? signInResult.message
        : undefined) ??
      (signOutResult?.status === 'signed_out'
        ? signedOutNote(options.noun)
        : undefined),
    isSsoManaged: status ? isSsoServer(status) : false,
    isSsoRefused: status ? isSsoRefused(status) : false,
    needsLogin: status ? needsSignIn(status) : false,
    isConnected: status?.status === 'connected',
    isSigningOut: signOut.isPending,
    // Each action resets the other's feedback: after a sign-out, a lingering
    // "already connected" note from an earlier sign-in would contradict what
    // just happened (and vice versa) -- only the latest action gets to speak.
    signIn: () => {
      signOut.reset();
      // Opened now, while still inside the user gesture (see signInTabRef);
      // it shows about:blank until muster's challenge navigates it.
      const tab = window.open('', '_blank') ?? null;
      if (tab) {
        // Same hygiene as a rel="noopener" link: the sign-in page never
        // needs a handle back to this tab.
        tab.opener = null;
      }
      signInTabRef.current = tab;
      signIn.mutate();
    },
    signOut: () => {
      signIn.reset();
      signOut.mutate();
    },
  };
}
