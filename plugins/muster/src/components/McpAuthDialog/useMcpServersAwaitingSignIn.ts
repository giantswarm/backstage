import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  isMusterTokenMintError,
  musterApiRef,
  type ProviderAppAuthStatus,
  type ServerAuthStatus,
} from '../../apis';
import { authStatusQueryKey, needsSignIn } from '../shared';

/**
 * How often the status is re-read while nothing is happening: a server can
 * start to wait for a grant without the person doing anything (a new server,
 * an expired grant), and the inbox's sign-in row should say so without a
 * reload.
 */
export const AUTH_STATUS_REFRESH_MS = 5 * 60 * 1_000;

export type McpServersAwaitingSignIn = {
  /** The servers waiting for the person's sign-in or grant, by name. */
  waiting: string[];
  /** muster's `auth://status` entries, sorted by name (empty until read). */
  statuses: ServerAuthStatus[];
  /**
   * The provider Apps muster keeps a grant of per person (`providerApps`),
   * sorted by name, optionally narrowed to `apps`; empty until read and on a
   * muster without Apps.
   */
  providerApps: ProviderAppAuthStatus[];
  /** True until the first answer. */
  isLoading: boolean;
  /**
   * muster answered with a status. False until then, when the read failed
   * and when muster could not say (`unavailable`): `waiting` is empty then
   * because nothing is known, not because nothing waits.
   */
  isAvailable: boolean;
  /**
   * The portal session is gone: the status is not read until the person is
   * back, and nothing reading in the background should ask for the sign-in.
   */
  sessionExpired: boolean;
  /**
   * muster is still connecting a server for this session (`sso_pending`): the
   * session's start has not finished, so the other servers' states may not
   * have settled either.
   */
  connecting: boolean;
  /** When muster last answered with a status (ms since the epoch); 0 before. */
  readAt: number;
  /**
   * When the last read ended, with a status or a failure (ms since the
   * epoch); 0 before the first.
   */
  answeredAt: number;
  /** Reads the status again now. */
  refetch: () => void;
};

function isSessionExpired(error: unknown): boolean {
  return isMusterTokenMintError(error) && error.reason === 'session-expired';
}

/**
 * The MCP servers of one muster that wait for the person's own sign-in or
 * grant (muster's per-user `auth://status`, `auth_required` or
 * `reauth_required`), optionally narrowed to `servers`. Shares its query with
 * every sign-in affordance of the installation, so a sign-in finished anywhere
 * drops the server from the list. An unreadable status reads as nothing
 * waiting: a sign-in prompt says what it knows, never an error of its own.
 */
export function useMcpServersAwaitingSignIn(
  installation: string | undefined,
  options: { servers?: string[]; apps?: string[]; enabled?: boolean } = {},
): McpServersAwaitingSignIn {
  const { servers, apps, enabled = true } = options;
  const musterApi = useApi(musterApiRef);

  const { data, error, isPending, dataUpdatedAt, errorUpdatedAt, refetch } =
    useQuery({
      queryKey: authStatusQueryKey(installation),
      queryFn: () => musterApi.getAuthStatus(installation),
      enabled,
      // The read never asks the person to sign in (`getAuthStatus`); once the
      // portal session is gone it stops until the person is back, on focus.
      refetchInterval: query =>
        isSessionExpired(query.state.error) ? false : AUTH_STATUS_REFRESH_MS,
      // As the sign-in affordances read it: re-read on return from the IdP's
      // tab, and an unreadable status is an answer, not a retry.
      refetchOnWindowFocus: true,
      retry: false,
    });

  const serversKey = servers?.join('\n');
  const appsKey = apps?.join('\n');
  return useMemo(() => {
    const wanted =
      serversKey === undefined ? undefined : serversKey.split('\n');
    const wantedApps = appsKey === undefined ? undefined : appsKey.split('\n');
    const providerApps = (data?.unavailable ? [] : (data?.providerApps ?? []))
      .filter(app => !wantedApps || wantedApps.includes(app.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    const statuses = (data?.unavailable ? [] : (data?.servers ?? []))
      .filter(status => !wanted || wanted.includes(status.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      statuses,
      providerApps,
      waiting: statuses.filter(needsSignIn).map(status => status.name),
      isLoading: enabled && isPending,
      isAvailable: Boolean(data) && !data?.unavailable,
      sessionExpired: isSessionExpired(error),
      connecting: statuses.some(status => status.status === 'sso_pending'),
      readAt: dataUpdatedAt,
      answeredAt: Math.max(dataUpdatedAt, errorUpdatedAt),
      refetch: () => {
        void refetch();
      },
    };
  }, [
    data,
    error,
    serversKey,
    appsKey,
    enabled,
    isPending,
    dataUpdatedAt,
    errorUpdatedAt,
    refetch,
  ]);
}
