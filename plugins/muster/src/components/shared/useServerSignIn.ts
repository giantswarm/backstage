import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { musterApiRef, ServerAuthStatus } from '../../apis';

/** How often `auth://status` is re-read while a browser sign-in is pending. */
const POLL_INTERVAL_MS = 5_000;

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
  /**
   * The server is SSO-managed (token forwarding/exchange): its connection is
   * established from muster's own session, so a user sign-in cannot fix it.
   */
  isSsoManaged: boolean;
  /** Whether muster reports this server as needing a user sign-in. */
  needsLogin: boolean;
  signIn: () => void;
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
 * leaves the auth-required states.
 *
 * The `auth://status` query is keyed per installation, so several rows on the
 * same page share one request.
 */
export function useServerSignIn(
  serverName: string,
  installation?: string,
): ServerSignInState {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();
  const [authUrl, setAuthUrl] = useState<string | undefined>();
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isWaiting = Boolean(authUrl) && !hasTimedOut;

  const { data } = useQuery({
    queryKey: ['muster', 'auth-status', installation],
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: Boolean(installation),
    refetchInterval: isWaiting ? POLL_INTERVAL_MS : false,
  });

  const status = data?.servers?.find(server => server.name === serverName);

  const signIn = useMutation({
    mutationFn: () => musterApi.signInServer(serverName, installation),
    onSuccess: result => {
      setHasTimedOut(false);
      if (result.status === 'auth_required' && result.authUrl) {
        setAuthUrl(result.authUrl);
        setError(undefined);
        return;
      }
      setAuthUrl(undefined);
      if (result.status === 'connected') {
        setError(undefined);
        queryClient.invalidateQueries({ queryKey: ['muster'] });
        return;
      }
      // 'error', or an answer we couldn't classify -- show muster's own words
      // rather than inventing a diagnosis.
      setError(result.message);
    },
    onError: (mutationError: Error) => {
      setAuthUrl(undefined);
      setError(mutationError.message);
    },
  });

  // Stop polling an abandoned flow instead of hammering the proxy forever.
  useEffect(() => {
    if (!authUrl || hasTimedOut) {
      return undefined;
    }
    const timer = setTimeout(() => setHasTimedOut(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [authUrl, hasTimedOut]);

  // The browser flow completed: muster connected the server for this session.
  useEffect(() => {
    if (!authUrl || !status || NEEDS_LOGIN.includes(status.status)) {
      return;
    }
    setAuthUrl(undefined);
    setHasTimedOut(false);
    queryClient.invalidateQueries({ queryKey: ['muster'] });
  }, [authUrl, status, queryClient]);

  return {
    status,
    isPending: signIn.isPending,
    authUrl,
    isWaiting,
    hasTimedOut,
    error,
    isSsoManaged: Boolean(
      status?.token_forwarding_enabled || status?.token_exchange_enabled,
    ),
    needsLogin: status ? NEEDS_LOGIN.includes(status.status) : false,
    signIn: () => signIn.mutate(),
  };
}
