import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';

/** How long an answer muster gave (an icon or none) is kept. */
const MUSTER_ICON_STALE_TIME_MS = 10 * 60_000;

/** How soon muster is asked again after it could not be. */
const MUSTER_ICON_RETRY_MS = 30_000;

/**
 * muster's own logo on `installation`: the icon it announces in its
 * `initialize` result (muster v5.59.0 and later), for its row in the
 * Connectors list and its page's header. muster is no MCPServer, so it has
 * no `.status.icon`. Undefined while it is read, from an older muster and
 * when it cannot be read: `ConnectorLogo` shows the letter tile then.
 * Session-scoped, so callers disable it without a muster session.
 */
export function useMusterIcon(
  installation: string | undefined,
  enabled: boolean,
): string | undefined {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    queryKey: ['muster', 'server-info', installation],
    queryFn: () => musterApi.getServerInfo(installation),
    enabled: enabled && Boolean(installation),
    // muster announces it once per session; it changes with a muster release.
    // An answer that muster could not be asked (a restart, a timeout) is kept
    // no longer than it takes to ask again, so it does not hold the letter
    // tile in place of the logo.
    staleTime: query =>
      query.state.data?.unavailable ? 0 : MUSTER_ICON_STALE_TIME_MS,
    refetchInterval: query =>
      query.state.data?.unavailable ? MUSTER_ICON_RETRY_MS : false,
  });
  return data?.icon;
}
