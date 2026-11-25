import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { musterApiRef, type GovernanceMode } from '../apis';
import {
  governanceModeOf,
  musterServerInfoQueryKey,
} from '../lib/governanceMode';

/**
 * The installation's governance mode (`governanceModeOf`, the one adapter),
 * from muster-backend's `/server-info` (the query `useMusterIcon` shares).
 * `undefined` while it is read, from a muster that does not report it and
 * when it cannot be asked: never `trusted` on a guess. It only picks the
 * preset the connector wizard pre-selects; muster enforces the rest.
 */
export function useGovernanceMode(installation: string | undefined): {
  mode: GovernanceMode | undefined;
  /** The read has settled (with a mode or without one). */
  settled: boolean;
} {
  const musterApi = useApi(musterApiRef);
  const { data, isSuccess, isError } = useQuery({
    queryKey: musterServerInfoQueryKey(installation),
    queryFn: () => musterApi.getServerInfo(installation),
    enabled: Boolean(installation),
    staleTime: 10 * 60_000,
    retry: false,
  });
  return { mode: governanceModeOf(data), settled: isSuccess || isError };
}
