import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  isMusterTokenMintError,
  musterApiRef,
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
  options: { servers?: string[]; enabled?: boolean } = {},
): McpServersAwaitingSignIn {
  const { servers, enabled = true } = options;
  const musterApi = useApi(musterApiRef);

  const { data, error, isPending } = useQuery({
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
  return useMemo(() => {
    const wanted =
      serversKey === undefined ? undefined : serversKey.split('\n');
    const statuses = (data?.unavailable ? [] : (data?.servers ?? []))
      .filter(status => !wanted || wanted.includes(status.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      statuses,
      waiting: statuses.filter(needsSignIn).map(status => status.name),
      isLoading: enabled && isPending,
      isAvailable: Boolean(data) && !data?.unavailable,
      sessionExpired: isSessionExpired(error),
    };
  }, [data, error, serversKey, enabled, isPending]);
}
