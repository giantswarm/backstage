import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { musterApiRef, type GovernanceMode } from '../apis';
import {
  governanceModeOf,
  musterServerInfoQueryKey,
} from '../lib/governanceMode';
import { musterServerListQueryKey } from './useMusterServerAvailability';

/**
 * The installation's governance mode (`governanceModeOf`): `governance` on
 * muster's `core_mcpserver_list` (muster-backend `/servers`, the query the
 * connector pages share), else on `/server-info` (the query `useMusterIcon`
 * shares). `undefined` while it is read, from a muster that does not report
 * it and when it cannot be asked: never `trusted` on a guess. It only picks
 * the preset the connector wizard pre-selects; muster enforces the rest.
 */
export function useGovernanceMode(installation: string | undefined): {
  mode: GovernanceMode | undefined;
  /** The reads have settled (with a mode or without one). */
  settled: boolean;
} {
  const musterApi = useApi(musterApiRef);
  const list = useQuery({
    queryKey: musterServerListQueryKey(installation),
    queryFn: () => musterApi.listServers(installation),
    enabled: Boolean(installation),
    retry: false,
  });
  const listMode = governanceModeOf(list.data);
  const info = useQuery({
    queryKey: musterServerInfoQueryKey(installation),
    queryFn: () => musterApi.getServerInfo(installation),
    // Only asked when the list did not name a mode.
    enabled:
      Boolean(installation) && (list.isSuccess || list.isError) && !listMode,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const mode = governanceModeOf(list.data, info.data);
  return {
    mode,
    settled: Boolean(mode) || info.isSuccess || info.isError,
  };
}
