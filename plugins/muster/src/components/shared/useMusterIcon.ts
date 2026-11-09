import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';

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
    staleTime: 10 * 60_000,
  });
  return data?.icon;
}
