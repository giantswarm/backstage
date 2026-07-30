import { useCallback, useEffect } from 'react';
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
 * How long to keep polling for an unfinished sign-in. Generous enough for an
 * IdP round-trip with an MFA prompt, bounded so an abandoned flow stops
 * polling.
 */
const POLL_TIMEOUT_MS = 3 * 60 * 1_000;

/** Statuses that mean the user themselves can still act (sign in). */
const NEEDS_LOGIN: ServerAuthStatus['status'][] = [
  'auth_required',
  'reauth_required',
];

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
  /** True while polling for the browser sign-in to complete. */
  isWaiting: boolean;
  /** True once polling gave up without the server becoming connected. */
  hasTimedOut: boolean;
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
  signIn: () => void;
}

export interface UseServerSignInOptions {
  /** Overridable so tests can drive the poll without real wall-clock waits. */
  pollIntervalMs?: number;
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
  const hasTimedOut = pending ? Date.now() >= pending.deadline : false;
  const isWaiting = Boolean(authUrl) && !hasTimedOut;

  const { data, error: statusError } = useQuery({
    queryKey: ['muster', 'auth-status', installation],
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: Boolean(installation),
    refetchInterval: isWaiting ? pollIntervalMs : false,
    // An unavailable status resource, or a 401 before the user has connected to
    // muster, are expected answers -- retrying each three times only multiplies
    // the noise.
    retry: false,
  });

  const status = data?.servers?.find(server => server.name === serverName);

  const signIn = useMutation({
    mutationFn: () => musterApi.signInServer(serverName, installation),
    onSuccess: result => {
      if (result.status === 'auth_required' && result.authUrl) {
        setPending({
          authUrl: result.authUrl,
          deadline: Date.now() + POLL_TIMEOUT_MS,
        });
        return;
      }
      setPending(null);
      if (result.status === 'connected') {
        queryClient.invalidateQueries({ queryKey: ['muster'] });
      }
    },
  });

  // Re-render once the deadline passes so the row can offer a fresh sign-in
  // instead of a challenge URL whose state has expired.
  useEffect(() => {
    if (!pending || hasTimedOut) {
      return undefined;
    }
    const timer = setTimeout(
      () => setPending({ ...pending }),
      Math.max(0, pending.deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pending, hasTimedOut, setPending]);

  // The browser flow completed: muster connected the server for this session.
  // Only `connected` ends the wait -- the same condition muster's CLI waits for
  // (`waitForServerAuthWithClient`). Any other status means the flow hasn't
  // landed yet, so keep polling until the deadline rather than silently dropping
  // the sign-in link.
  useEffect(() => {
    if (!pending || status?.status !== 'connected') {
      return;
    }
    setPending(null);
    queryClient.invalidateQueries({ queryKey: ['muster'] });
  }, [pending, status, queryClient, setPending]);

  const signInResult = signIn.data;
  const isFailure =
    signInResult?.status === 'error' || signInResult?.status === 'unknown';

  return {
    status,
    isPending: signIn.isPending,
    authUrl,
    isWaiting,
    hasTimedOut,
    // Muster's own words for a refusal, or the mutation's transport error. A
    // failed status read is only worth showing while a sign-in is outstanding:
    // then it explains a wait that can never end, whereas outside a flow it is
    // just noise next to content the user didn't ask about (the servers page
    // renders this above its own "connect to muster" gate).
    error:
      (isFailure ? signInResult?.message : undefined) ??
      signIn.error?.message ??
      (pending && statusError
        ? `Auth status: ${statusError.message}`
        : undefined),
    // 'connected' with the alert still up is a real combination (the two come
    // from different muster state), and silence there is indistinguishable from
    // the no-op click this feature fixes.
    note:
      signInResult?.status === 'connected' ? signInResult.message : undefined,
    isSsoManaged: Boolean(
      status?.token_forwarding_enabled || status?.token_exchange_enabled,
    ),
    needsLogin: status ? NEEDS_LOGIN.includes(status.status) : false,
    signIn: () => signIn.mutate(),
  };
}
